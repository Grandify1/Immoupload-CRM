import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, AlertCircle, Check, Plus } from 'lucide-react';
import { Lead, CustomField } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface CSVImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[]) => Promise<void>;
  onAddCustomField: (name: string, type: string) => Promise<void>;
  customFields?: CustomField[];
  onRefresh?: () => void;
}

type MappingType = {
  csvHeader: string;
  fieldName: string | null;
  createCustomField: boolean;
  customFieldType: 'text' | 'number' | 'date' | 'select';
};

type DuplicateHandlingConfig = {
  duplicateDetectionField: 'name' | 'email' | 'phone' | 'none';
  duplicateAction: 'skip' | 'update' | 'create_new';
};

const CSVImport: React.FC<CSVImportProps> = ({ isOpen, onClose, onImport, onAddCustomField, customFields, onRefresh }) => {

  // Debug logging and load custom fields if not provided
  React.useEffect(() => {
    console.log('=== CSVImport Custom Fields Debug ===');
    console.log('All customFields received:', customFields);
    console.log('customFields is array?', Array.isArray(customFields));
    console.log('customFields length:', customFields?.length);

    if (customFields && customFields.length > 0) {
      console.log('Lead custom fields:', customFields.filter(f => f.entity_type === 'lead'));
      console.log('First custom field example:', customFields[0]);

      // Log each custom field detail
      customFields.forEach((field, index) => {
        console.log(`Custom Field ${index}:`, {
          id: field.id,
          name: field.name,
          entity_type: field.entity_type,
          field_type: field.field_type,
          sort_order: field.sort_order
        });
      });
    } else {
      console.log('No custom fields provided, attempting to load from database...');

      // If no custom fields provided, try to load them directly
      const loadCustomFields = async () => {
        try {
          const { data, error } = await supabase
            .from('custom_fields')
            .select('*')
            .eq('entity_type', 'lead')
            .order('sort_order');

          if (error) {
            console.error('Error loading custom fields:', error);
          } else {
            console.log('Loaded custom fields from database:', data);
          }
        } catch (err) {
          console.error('Failed to load custom fields:', err);
        }
      };

      loadCustomFields();
    }
    console.log('=== End Custom Fields Debug ===');
  }, [customFields]);

  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<MappingType[]>([]);
  const [csvData, setCSVData] = useState<string[][]>([]);
  const [step, setStep] = useState<'upload' | 'map' | 'duplicates' | 'preview' | 'importing'>('upload');
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [duplicateConfig, setDuplicateConfig] = useState<DuplicateHandlingConfig>({
    duplicateDetectionField: 'name',
    duplicateAction: 'update'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const standardFields = [
    { name: 'name', label: 'Name' },
    { name: 'email', label: 'Email' },
    { name: 'phone', label: 'Phone' },
    { name: 'website', label: 'Website' },
    { name: 'address', label: 'Address' },
    { name: 'description', label: 'Description' },
    { name: 'status', label: 'Status' },
    { name: 'owner_id', label: 'Owner' },
  ];

  // Custom Fields für Leads mit verbesserter Verarbeitung
  const leadCustomFields = React.useMemo(() => {
    if (!customFields || !Array.isArray(customFields)) {
      return [];
    }

    const leadFields = customFields
      .filter(field => field && field.entity_type === 'lead')
      .map(field => ({
        name: field.name.toLowerCase().replace(/\s+/g, '_'),
        label: `${field.name} (Custom)`,
        isCustom: true,
        originalName: field.name,
        fieldType: field.field_type
      }));

    return leadFields;
  }, [customFields]);

  const allAvailableFields = React.useMemo(() => {
    return [
      ...standardFields,
      ...leadCustomFields
    ];
  }, [leadCustomFields]);

  const resetState = () => {
    setFile(null);
    setHeaders([]);
    setMappings([]);
    setCSVData([]);
    setStep('upload');
    setImportProgress(0);
    setError(null);
    setDuplicateConfig({
      duplicateDetectionField: 'name',
      duplicateAction: 'update'
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseCSV(selectedFile);
    }
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;

        // Universelles CSV-Parsing für verschiedene Formate
        const parseCSVContent = (csvText: string): { headers: string[], data: string[][] } => {
          // Automatische Erkennung des Trennzeichens
          const detectDelimiter = (text: string): string => {
            const sample = text.split('\n').slice(0, 5).join('\n'); // Erste 5 Zeilen analysieren
            const delimiters = [';', ',', '\t', '|'];
            const counts = delimiters.map(delimiter => ({
              delimiter,
              count: (sample.match(new RegExp(`\\${delimiter}`, 'g')) || []).length
            }));

            // Wähle das Trennzeichen mit den meisten Vorkommen
            const bestDelimiter = counts.reduce((prev, current) => 
              current.count > prev.count ? current : prev
            );

            console.log('CSV delimiter detection:', counts, 'Selected:', bestDelimiter.delimiter);
            return bestDelimiter.delimiter;
          };

          const delimiter = detectDelimiter(csvText);
          const result: string[][] = [];
          let current = '';
          let inQuotes = false;
          let row: string[] = [];
          let quoteChar = '"';

          // Erweiterte Anführungszeichen-Erkennung
          const detectQuoteChar = (text: string): string => {
            const firstLine = text.split('\n')[0];
            if (firstLine.includes('"')) return '"';
            if (firstLine.includes("'")) return "'";
            return '"'; // Standard
          };

          quoteChar = detectQuoteChar(csvText);
          console.log('CSV quote character detected:', quoteChar);

          for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];

            if (char === quoteChar) {
              if (inQuotes && nextChar === quoteChar) {
                // Escaped quote
                current += quoteChar;
                i++; // Skip next quote
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === delimiter && !inQuotes) {
              // Field separator
              row.push(current.trim());
              current = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
              // Row separator (only when not in quotes)
              if (current.trim() !== '' || row.length > 0) {
                row.push(current.trim());
                if (row.some(field => field !== '')) { // Only add rows with content
                  result.push([...row]); // Create copy of row
                }
                row = [];
                current = '';
              }
              // Skip \r\n combination
              if (char === '\r' && nextChar === '\n') {
                i++;
              }
            } else {
              current += char;
            }
          }

          // Add last field and row if exists
          if (current.trim() !== '' || row.length > 0) {
            row.push(current.trim());
            if (row.some(field => field !== '')) {
              result.push([...row]);
            }
          }

          if (result.length === 0) {
            throw new Error('Keine gültigen Zeilen gefunden');
          }

          // Clean headers - remove quotes and normalize
          const headers = result[0].map(h => {
            let cleanHeader = h.replace(/^["']|["']$/g, '').trim();

            // Normalisiere deutsche Umlaute und Sonderzeichen für bessere Zuordnung
            const normalizeGermanText = (text: string): string => {
              return text
                .toLowerCase()
                .replace(/ä/g, 'ae')
                .replace(/ö/g, 'oe')
                .replace(/ü/g, 'ue')
                .replace(/ß/g, 'ss')
                .replace(/[^a-z0-9]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '');
            };

            // Speichere sowohl Original als auch normalisierte Version
            return {
              original: cleanHeader,
              normalized: normalizeGermanText(cleanHeader),
              display: cleanHeader
            };
          });

          // Clean data rows
          const data = result.slice(1).map(row => {
            // Ensure consistent column count
            const cleanRow = [...row];
            while (cleanRow.length < headers.length) {
              cleanRow.push('');
            }
            if (cleanRow.length > headers.length) {
              cleanRow.splice(headers.length);
            }

            return cleanRow.map(cell => {
              // Remove quotes and clean cell content
              let cleanCell = cell.replace(/^["']|["']$/g, '').trim();

              // Handle multiline content in cells
              cleanCell = cleanCell.replace(/\r\n|\r|\n/g, ' ').trim();

              return cleanCell;
            });
          });

          console.log(`CSV parsing completed: ${data.length} rows, ${headers.length} columns`);
          console.log('Headers detected:', headers.map(h => h.display));

          return { 
            headers: headers.map(h => h.display), 
            data,
            headersMetadata: headers // Zusätzliche Metadaten für bessere Zuordnung
          };
        };

        const parseResult = parseCSVContent(text);
        const { headers, data } = parseResult;
        const headersMetadata = parseResult.headersMetadata || headers.map(h => ({ original: h, normalized: h, display: h }));

        if (headers.some(header => header === '')) {
          setError('CSV-Datei enthält leere Spaltenüberschriften.');
          setStep('upload');
          return;
        }

        // Filtere und validiere Datenzeilen
        const validData = data.filter(row => {
          // Prüfe ob Zeile mindestens ein nicht-leeres Feld hat
          return row.some(value => value && value.length > 0);
        });

        console.log(`CSV parsing completed: ${validData.length} valid rows from ${data.length} total rows`);

        if (validData.length === 0) {
            setError('CSV-Datei enthält keine gültigen Datenzeilen.');
            setStep('upload');
            return;
        }

        setHeaders(headers);
        setCSVData(validData);

        // Erweiterte automatische Feldzuordnung
        const createFieldMapping = (header: string, headerMeta: any): MappingType => {
          const headerLower = header.toLowerCase();
          const headerNormalized = headerMeta.normalized || header.toLowerCase();

          // Erweiterte Zuordnungsregeln für verschiedene Sprachen und Formate
            const fieldMappings = {
              // Standard Lead Felder - Deutsch
              'name': ['name', 'namen', 'firmenname', 'firma', 'unternehmen', 'company', 'business_name'],
              'email': ['email', 'e_mail', 'e-mail', 'mail', 'kontakt_email'],
              'phone': ['phone', 'telefon', 'tel', 'telephone', 'handy', 'mobile', 'contact_phone'],
              'website': ['website', 'webseite', 'homepage', 'url', 'web'],
              'address': ['address', 'adresse', 'anschrift', 'standort', 'ort', 'location'],
              'description': ['description', 'beschreibung', 'info', 'information', 'details', 'kommentar'],
              'status': ['status', 'zustand', 'state', 'stage'],

              // Spezielle Felder aus Google Maps Daten - KEINE Überschneidungen mit Standard-Feldern
              'reviews': ['reviews', 'bewertungen', 'anzahl_bewertungen', 'review_count'],
              'rating': ['rating', 'bewertung', 'sterne', 'stars', 'durchschnitt'],
              'competitors': ['competitors', 'konkurrenz', 'wettbewerber'],

              // Custom Fields - diese werden NICHT zu Standard-Feldern gemappt
              'place_id': ['place_id', 'google_place_id'],
              'owner_name': ['owner_name', 'besitzer', 'eigentumer', 'inhaber'],
              'owner_profile_link': ['owner_profile_link', 'owner_link'],
              'featured_image': ['featured_image', 'image', 'bild', 'foto'],
              'main_category': ['main_category', 'kategorie', 'hauptkategorie', 'branche'],
              'categories': ['categories', 'kategorien'],
              'workday_timing': ['workday_timing', 'opening_hours', 'oeffnungszeiten', 'arbeitszeiten'],
              'can_claim': ['can_claim', 'beanspruchbar'],
              'is_temporarily_closed': ['is_temporarily_closed', 'is_closed', 'geschlossen'],
              'closed_on': ['closed_on', 'geschlossen_am'],
              'review_keywords': ['review_keywords', 'keywords', 'schlusselworter', 'suchbegriffe'],
              'link': ['link', 'google_link'],
              'query': ['query', 'suchbegriff'],
              'is_spending_on_ads': ['is_spending_on_ads', 'werbung', 'anzeigen']
            };

          // Suche nach passenden Feldern
          for (const [fieldName, patterns] of Object.entries(fieldMappings)) {
            for (const pattern of patterns) {
              if (headerLower.includes(pattern) || headerNormalized.includes(pattern.replace(/[^a-z0-9]/g, '_'))) {
                // Prüfe ob das Feld in verfügbaren Feldern existiert
                const matchedField = allAvailableFields.find(f => f.name === fieldName);
                if (matchedField) {
                  console.log(`Auto-mapped "${header}" to "${fieldName}"`);
                  return {
                    csvHeader: header,
                    fieldName: fieldName,
                    createCustomField: false,
                    customFieldType: 'text'
                  };
                }
              }
            }
          }

          // Fallback: Exakte Übereinstimmung mit verfügbaren Feldern
          const exactMatch = allAvailableFields.find(field => 
            field.label.toLowerCase() === headerLower || 
            field.name.toLowerCase() === headerLower ||
            (field.originalName && field.originalName.toLowerCase() === headerLower)
          );

          if (exactMatch) {
            console.log(`Exact match found for "${header}" -> "${exactMatch.name}"`);
            return {
              csvHeader: header,
              fieldName: exactMatch.name,
              createCustomField: false,
              customFieldType: 'text'
            };
          }

          // Kein Match gefunden
          console.log(`No auto-mapping found for "${header}"`);
          return {
            csvHeader: header,
            fieldName: null,
            createCustomField: false,
            customFieldType: 'text'
          };
        };

        const initialMappings: MappingType[] = headers.map((header, index) => 
          createFieldMapping(header, headersMetadata[index] || { normalized: header })
        );

        setMappings(initialMappings);
        setStep('map');
        setError(null);

      } catch (error) {
        console.error('Error parsing CSV:', error);
        setError('Fehler beim Parsen der CSV-Datei. Bitte überprüfen Sie das Format.');
        setStep('upload');
      }
    };

    reader.onerror = () => {
        setError('Fehler beim Lesen der Datei.');
        setStep('upload');
    };

    reader.readAsText(file);
  };

  const handleMappingChange = (index: number, fieldName: string | null) => {
    const newMappings = [...mappings];
    newMappings[index].fieldName = fieldName;
    newMappings[index].createCustomField = false;
    setMappings(newMappings);
  };

  const handleCustomFieldToggle = (index: number, checked: boolean) => {
    const newMappings = [...mappings];
    newMappings[index].createCustomField = checked;
    if (checked && !newMappings[index].fieldName) {
      newMappings[index].fieldName = newMappings[index].csvHeader.toLowerCase().replace(/\s+/g, '_');
    }
    setMappings(newMappings);
  };

  const handleCustomFieldTypeChange = (index: number, type: 'text' | 'number' | 'date' | 'select') => {
    const newMappings = [...mappings];
    newMappings[index].customFieldType = type;
    setMappings(newMappings);
  };

  const handleContinueToDuplicates = () => {
    const hasNameMapping = mappings.some(m => m.fieldName === 'name');

    if (!hasNameMapping) {
      setError('You must map the "Name" field to continue.');
      return;
    }

    setError(null);
    setStep('duplicates');
  };

  const handleContinueToPreview = () => {
    setError(null);
    setStep('preview');
  };

  const handleImport = async () => {
    try {
      console.log('=== STARTING IMPORT PROCESS ===');
      setStep('importing');
      setImportProgress(0);
      setError(null);

      // Check if we have any leads to import
      if (!csvData || csvData.length === 0) {
        setError('Keine Daten zum Importieren gefunden.');
        setStep('preview');
        return;
      }

      console.log('CSV data rows:', csvData.length);
      console.log('Mappings:', mappings);

      // Get current user info for import job FIRST
      console.log('=== GETTING USER INFO ===');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('❌ Error getting user:', userError);
        setError(`Authentifizierungsfehler: ${userError.message}`);
        setStep('preview');
        return;
      }

      if (!user?.id) {
        console.error('❌ No user found');
        setError('Benutzer nicht gefunden. Bitte loggen Sie sich erneut ein.');
        setStep('preview');
        return;
      }

      console.log('✅ User found:', user.id);
      setImportProgress(25);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('team_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('❌ Error getting profile:', profileError);
        setError(`Profil-Fehler: ${profileError.message}`);
        setStep('preview');
        return;
      }

      if (!profile?.team_id) {
        console.error('❌ No team found for user');
        setError('Team-Information nicht gefunden. Bitte kontaktieren Sie den Support.');
        setStep('preview');
        return;
      }

      console.log('✅ Profile found, team_id:', profile.team_id);
      setImportProgress(30);

      const customFieldMappings = mappings.filter(m => m.createCustomField && m.fieldName);
      console.log('Custom fields to create:', customFieldMappings);

      // Create new custom fields first
      for (const mapping of customFieldMappings) {
        if (mapping.fieldName) {
          try {
            console.log('Creating custom field:', mapping.fieldName);
            await onAddCustomField(mapping.fieldName, mapping.customFieldType);
            console.log('✅ Custom field created:', mapping.fieldName);
          } catch (error) {
            console.log('Custom field might already exist:', mapping.fieldName, error);
          }
        }
      }

      console.log('=== PROCESSING CSV DATA ===');
      const leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[] = [];

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const lead: any = {
          custom_fields: {}
        };

        mappings.forEach((mapping, index) => {
          if (mapping.fieldName && index < row.length) {
            const value = row[index]?.trim();
            if (!value) return; // Skip empty values

            const targetField = allAvailableFields.find(f => f.name === mapping.fieldName);

            if (targetField && standardFields.some(sf => sf.name === targetField.name)) {
               if (targetField.name === 'status' && !['potential', 'contacted', 'qualified', 'closed'].includes(value)) {
                 lead[targetField.name] = 'potential';
               } else {
                 lead[targetField.name] = value;
               }
            } else if (mapping.createCustomField && mapping.fieldName) {
              lead.custom_fields[mapping.fieldName] = value;
            } else if (targetField && targetField.isCustom) {
              // Use the standardized field key for custom fields
              lead.custom_fields[targetField.name] = value;
            }
          }
        });

        // Set required fields
        if (!lead.status) lead.status = 'potential';
        lead.team_id = profile.team_id; // Ensure team_id is always set

        // Check if lead has required name field
        if (lead.name && lead.name.trim()) {
          leads.push(lead as Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>);
        }

        // Update progress for data processing
        setImportProgress(30 + Math.round(((i + 1) / csvData.length) * 10)); // 10% for data processing
      }

      console.log('✅ Processed CSV data, prepared leads:', leads.length);
      if (leads.length === 0) {
        setError('Keine gültigen Leads gefunden. Überprüfen Sie Ihre Feldzuordnung.');
        setStep('preview');
        return;
      }

      console.log('Sample lead:', leads[0]);
      setImportProgress(40);

      // Create import job entry in Supabase
      console.log('=== CREATING IMPORT JOB IN SUPABASE ===');
      let importJob = null;
      let skipJobTracking = false;

      try {
        const importJobData = {
          file_name: file?.name || 'unknown.csv',
          total_records: leads.length,
          processed_records: 0,
          failed_records: 0,
          status: 'processing' as const,
          error_details: null,
          team_id: profile.team_id,
          created_by: user.id,
          undo_status: 'active' as const
        };

        console.log('Import job data:', importJobData);

        const { data: jobData, error: jobError } = await supabase
          .from('import_jobs')
          .insert([importJobData])
          .select()
          .single();

        if (jobError) {
          console.error('❌ Failed to create import job:', jobError);
          console.error('Job error code:', jobError.code);

          // If table doesn't exist, proceed with import but skip job tracking
          if (jobError.code === 'PGRST204' || jobError.code === '42P01' || jobError.message?.includes('relation "import_jobs" does not exist')) {
            console.warn('⚠️ Import jobs table not found, proceeding without tracking...');
            skipJobTracking = true;
          } else {
            setError(`Import-Job Fehler: ${jobError.message}`);
            setStep('preview');
            return;
          }
        } else {
          importJob = jobData;
          console.log('✅ Import job created with ID:', importJob.id);
        }
      } catch (error: any) {
        console.warn('⚠️ Import job creation failed, proceeding without tracking...', error);
        skipJobTracking = true;
      }

      setImportProgress(45);

      // Now perform the actual import with duplicate handling
      console.log('=== STARTING LEAD IMPORT WITH DUPLICATE HANDLING ===');
      console.log('Duplicate Detection Config:', duplicateConfig);
      console.log('Detection Field:', duplicateConfig.duplicateDetectionField);
      console.log('Detection Action:', duplicateConfig.duplicateAction);
      const batchSize = 50; // Smaller batches for better error handling
      let batchIndex = 0;
      let totalBatches = Math.ceil(leads.length / batchSize);
      let processedRecords = 0;
      let failedRecords = 0;
      let duplicateRecords = 0;
      let updatedRecords = 0;

      // Split leads into batches for more efficient insertion
      for (let i = 0; i < leads.length; i += batchSize) {
        const batch = leads.slice(i, i + batchSize);
        batchIndex = Math.floor(i / batchSize);

        console.log(`=== PROCESSING BATCH ${batchIndex + 1}/${totalBatches} (${batch.length} leads) ===`);

        // Process each lead individually to handle duplicates properly
        for (const lead of batch) {
          try {
            console.log(`\n📋 Processing lead: "${lead.name}" from CSV`);
            console.log('Lead data:', {
              name: lead.name,
              email: lead.email,
              phone: lead.phone,
              website: lead.website
            });

            let existingLead = null;
            let checkError = null;

            // Check for duplicates based on user configuration
            if (duplicateConfig.duplicateDetectionField !== 'none') {
              const detectionField = duplicateConfig.duplicateDetectionField;
              const detectionValue = lead[detectionField];

              if (detectionValue && detectionValue.trim()) {
                console.log(`🔍 Checking for duplicate using ${detectionField}: "${detectionValue}"`);

                let query = supabase
                  .from('leads')
                  .select('id, name, email, phone, website, address, description, status, custom_fields')
                  .eq('team_id', profile.team_id);

                // Add the appropriate filter based on detection field with exact match
                if (detectionField === 'name') {
                  query = query.eq('name', detectionValue.trim());
                } else if (detectionField === 'email') {
                  query = query.eq('email', detectionValue.trim());
                } else if (detectionField === 'phone') {
                  query = query.eq('phone', detectionValue.trim());
                }

                const result = await query.single();
                existingLead = result.data;
                checkError = result.error;

                if (existingLead) {
                  console.log(`⚠️ DUPLICATE FOUND: CSV "${detectionValue}" matches existing lead "${existingLead[detectionField]}" (ID: ${existingLead.id})`);
                } else if (checkError && checkError.code === 'PGRST116') {
                  console.log(`✅ No duplicate found for ${detectionField}: "${detectionValue}" (PGRST116: no rows found)`);
                } else if (checkError) {
                  console.log(`⚠️ Error checking for duplicate on ${detectionField}: "${detectionValue}":`, checkError);
                } else {
                  console.log(`✅ No duplicate found for ${detectionField}: "${detectionValue}"`);
                }
              }
            }

            if (checkError && checkError.code !== 'PGRST116') {
              // PGRST116 is "no rows found" - that's what we want for new leads
              console.error('❌ Error checking for existing lead:', checkError);
              failedRecords++;
              continue;
            }

            if (existingLead) {
              // Duplicate found - handle based on user configuration
              const detectionField = duplicateConfig.duplicateDetectionField;
              const detectionValue = lead[detectionField];

              if (duplicateConfig.duplicateAction === 'skip') {
                console.log(`⏭️ SKIPPING: CSV lead "${lead.name}" because duplicate found with existing lead "${existingLead.name}" (${detectionField}: ${detectionValue})`);
                duplicateRecords++;
                continue;
              } else if (duplicateConfig.duplicateAction === 'update') {
                console.log(`🔄 UPDATING: Existing lead "${existingLead.name}" (ID: ${existingLead.id}) with data from CSV lead "${lead.name}"`);

                // Merge data intelligently: only update fields that have values and are different
                const updateData: any = {
                  updated_at: new Date().toISOString()
                };

                // Update standard fields if they have values and are different
                if (lead.name && lead.name !== existingLead.name) {
                  console.log(`  - Updating name: "${existingLead.name}" → "${lead.name}"`);
                  updateData.name = lead.name;
                }
                if (lead.email && lead.email !== existingLead.email) {
                  console.log(`  - Updating email: "${existingLead.email}" → "${lead.email}"`);
                  updateData.email = lead.email;
                }
                if (lead.phone && lead.phone !== existingLead.phone) {
                  console.log(`  - Updating phone: "${existingLead.phone}" → "${lead.phone}"`);
                  updateData.phone = lead.phone;
                }
                if (lead.website && lead.website !== existingLead.website) {
                  console.log(`  - Updating website: "${existingLead.website}" → "${lead.website}"`);
                  updateData.website = lead.website;
                }
                if (lead.address && lead.address !== existingLead.address) updateData.address = lead.address;
                if (lead.description && lead.description !== existingLead.description) updateData.description = lead.description;
                if (lead.status && lead.status !== existingLead.status) updateData.status = lead.status;

                // Merge custom fields intelligently
                if (lead.custom_fields && Object.keys(lead.custom_fields).length > 0) {
                  const existingCustomFields = existingLead.custom_fields || {};
                  updateData.custom_fields = {
                    ...existingCustomFields,
                    ...lead.custom_fields
                  };
                  console.log(`  - Updating custom fields:`, lead.custom_fields);
                }

                const { error: updateError } = await supabase
                  .from('leads')
                  .update(updateData)
                  .eq('id', existingLead.id);

                if (updateError) {
                  console.error(`❌ Error updating lead (${detectionField}: ${detectionValue}):`, updateError);
                  failedRecords++;
                } else {
                  console.log(`✅ Successfully updated existing lead "${existingLead.name}" with CSV data`);
                  updatedRecords++;
                  processedRecords++;
                }
              } else if (duplicateConfig.duplicateAction === 'create_new') {
                console.log(`📝 Creating new lead despite duplicate (${detectionField}: ${detectionValue})`);

                // For create_new, keep the original data but let Supabase generate a new UUID
                // This way the name stays clean and professional
                const { data: insertedLead, error: insertError } = await supabase
                  .from('leads')
                  .insert([lead])
                  .select('id, name')
                  .single();

                if (insertError) {
                  console.error(`❌ Error inserting duplicate lead (${detectionField}: ${detectionValue}):`, insertError);

                  // If still fails due to constraint, skip it
                  if (insertError.code === '23505') {
                    console.log(`🔍 Still duplicate constraint violation, skipping: ${lead.name}`);
                    duplicateRecords++;
                  } else {
                    failedRecords++;
                  }
                } else {
                  console.log(`✅ Successfully inserted duplicate lead with clean name: ${insertedLead.name} (ID: ${insertedLead.id})`);
                  processedRecords++;
                }
              }

            } else {
              // Lead doesn't exist - insert new one
              console.log(`📝 INSERTING NEW LEAD: "${lead.name}" from CSV (no duplicates found)`);

              const { data: insertedLead, error: insertError } = await supabase
                .from('leads')
                .insert([lead])
                .select('id, name')
                .single();

              if (insertError) {
                console.error(`❌ Error inserting lead "${lead.name}":`, insertError);
                console.error('Full error details:', insertError);

                // Check if it's a duplicate error that slipped through
                if (insertError.code === '23505' && insertError.message?.includes('already exists')) {
                  duplicateRecords++;
                  console.log(`🔍 Database constraint duplicate detected for: "${lead.name}"`);
                } else {
                  failedRecords++;
                }
              } else {
                console.log(`✅ Successfully inserted new lead: "${insertedLead.name}" (ID: ${insertedLead.id})`);
                processedRecords++;
              }
            }

          } catch (error) {
            console.error(`❌ Unexpected error processing lead ${lead.name}:`, error);
            failedRecords++;
          }
        }

        // Update progress
        setImportProgress(45 + Math.round(((i + batchSize) / leads.length) * 45));
      }

      setImportProgress(95);

      // Show detailed final result FIRST
      let summaryMessage = '';
      const totalAttempted = leads.length;

      if (failedRecords === 0 && duplicateRecords === 0) {
        summaryMessage = `✅ Import erfolgreich: ${processedRecords} Leads verarbeitet (${processedRecords - updatedRecords} neu, ${updatedRecords} aktualisiert).`;
      } else if (processedRecords === 0) {
        summaryMessage = `❌ Import fehlgeschlagen: ${failedRecords} Leads konnten nicht verarbeitet werden, ${duplicateRecords} Duplikate übersprungen.`;
      } else {
        const newLeads = processedRecords - updatedRecords;
        summaryMessage = `⚠️ Import abgeschlossen: ${newLeads} neue Leads, ${updatedRecords} aktualisiert, ${duplicateRecords} Duplikate übersprungen, ${failedRecords} fehlgeschlagen.`;
      }

      // Update final import job status in Supabase (only if job tracking is available)
      if (!skipJobTracking && importJob) {
        const finalStatus = failedRecords === 0 ? 'completed' : 'completed_with_errors';

        console.log('=== UPDATING FINAL IMPORT JOB STATUS IN SUPABASE ===');
        console.log('Final status:', finalStatus);
        console.log('Processed records:', processedRecords);
        console.log('Failed records:', failedRecords);

        try {
          const { error: updateError } = await supabase
            .from('import_jobs')
            .update({
              status: finalStatus,
              processed_records: processedRecords,
              failed_records: failedRecords,
              error_details: {
                new_records: processedRecords - updatedRecords,
                updated_records: updatedRecords,
                duplicate_records: duplicateRecords,
                failed_records: failedRecords,
                summary: summaryMessage
              },
              updated_at: new Date().toISOString()
            })
            .eq('id', importJob.id);

          if (updateError) {
            console.error('❌ Error updating import job status in Supabase:', updateError);
          } else {
            console.log('✅ Import job status updated successfully in Supabase');
          }
        } catch (updateError) {
          console.warn('⚠️ Could not update final import job status:', updateError);
        }
      } else {
        console.log('⚠️ Import job tracking skipped - table not available');
      }

      setImportProgress(100);

      console.log('=== IMPORT COMPLETE ===');
      console.log('Final result:', summaryMessage);

      // Show success message instead of error
      setError(summaryMessage);

      // Trigger refresh of leads data in parent component
      if (onRefresh) {
        console.log('🔄 Triggering automatic refresh of leads data...');
        onRefresh();
      }

      // Close dialog after delay
      setTimeout(() => {
        resetState();
        onClose();
      }, 3000);

    } catch (error: any) {
      console.error('❌ CRITICAL ERROR during import:', error);
      setError(`Kritischer Fehler: ${error?.message || 'Unbekannter Fehler'}`);
      setStep('preview');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        if (step === 'importing') {
          const confirmClose = window.confirm(
            'Der Import ist noch nicht abgeschlossen. Wenn Sie jetzt schließen, wird der Import abgebrochen. Möchten Sie wirklich schließen?'
          );
          if (confirmClose) {
            onClose();
          }
        } else {
          onClose();
        }
      }
    }}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
          <DialogDescription>
            Import leads from a CSV file with field mapping and duplicate handling options.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="py-6">
            <div 
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">Click to upload or drag and drop</p>
              <p className="text-xs text-gray-500 mt-1">CSV files only</p>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileChange}
              />
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 'map' && (
          <div className="py-4 flex-1 overflow-hidden flex flex-col">
            <p className="text-sm text-gray-600 mb-4">
              Map the CSV columns to lead fields. You can also create custom fields for unmapped columns.
            </p>

            <div className="flex-1 overflow-y-auto border rounded-md">
              <table className="w-full">
                <thead className="bg-gray-50 text-left sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 text-sm font-medium text-gray-600">CSV Column</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-600">Map to Field</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-600">Create Custom Field</th>
                    <th className="px-4 py-2 text-sm font-medium text-gray-600">Field Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mappings.map((mapping, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{mapping.csvHeader}</td>
                      <td className="px-4 py-3">
                        <Select
                          value={mapping.fieldName || ''}
                          onValueChange={(value) => {
                            console.log('Field mapping changed:', { csvColumn: mapping.csvHeader, selectedField: value });
                            handleMappingChange(index, value === '__skip__' ? null : value);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">Do not import</SelectItem>
                            {allAvailableFields.map(field => {
                              const fieldValue = typeof field === 'string' ? field : field.name || String(field);
                              const fieldLabel = typeof field === 'string' ? field : field.label || field.name || String(field);
                              return (
                                <SelectItem key={fieldValue} value={fieldValue}>
                                  {fieldLabel}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2">
                          {!mapping.createCustomField ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCustomFieldToggle(index, true)}
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Als Custom Field
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleCustomFieldToggle(index, false)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                          {mapping.createCustomField && (
                            <Input
                              value={mapping.fieldName || ''}
                              onChange={(e) => {
                                const newMappings = [...mappings];
                                newMappings[index].fieldName = e.target.value;
                                setMappings(newMappings);
                              }}
                              placeholder="Feldname"
                              className="w-40"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {mapping.createCustomField && (
                          <Select
                            value={mapping.customFieldType}
                            onValueChange={(value) => 
                              handleCustomFieldTypeChange(index, value as 'text' | 'number' | 'date' | 'select')
                            }
                            disabled={!mapping.createCustomField}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="text">Text</SelectItem>
                              <SelectItem value="number">Zahl</SelectItem>
                              <SelectItem value="date">Datum</SelectItem>
                              <SelectItem value="select">Auswahl</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 'duplicates' && (
          <div className="py-4 space-y-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Duplicate Handling Configuration</h3>
              <p className="text-sm text-gray-600 mb-6">
                Configure how to handle duplicate leads during import. Duplicates are detected based on the field you choose below.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Duplicate Detection Field */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Duplicate Detection Field</CardTitle>
                  <p className="text-sm text-gray-600">Choose which field to use for detecting duplicates</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="detect-name"
                        name="duplicateDetection"
                        value="name"
                        checked={duplicateConfig.duplicateDetectionField === 'name'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateDetectionField: e.target.value as 'name' | 'email' | 'phone' | 'none'
                        }))}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="detect-name" className="text-sm font-medium">
                        Name
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="detect-email"
                        name="duplicateDetection"
                        value="email"
                        checked={duplicateConfig.duplicateDetectionField === 'email'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateDetectionField: e.target.value as 'name' | 'email' | 'phone' | 'none'
                        }))}
                        className="h-4 w-4"
                        disabled={!mappings.some(m => m.fieldName === 'email')}
                      />
                      <Label htmlFor="detect-email" className={cn(
                        "text-sm font-medium",
                        !mappings.some(m => m.fieldName === 'email') && "text-gray-400"
                      )}>
                        Email {!mappings.some(m => m.fieldName === 'email') && "(nicht gemappt)"}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="detect-phone"
                        name="duplicateDetection"
                        value="phone"
                        checked={duplicateConfig.duplicateDetectionField === 'phone'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateDetectionField: e.target.value as 'name' | 'email' | 'phone' | 'none'
                        }))}
                        className="h-4 w-4"
                        disabled={!mappings.some(m => m.fieldName === 'phone')}
                      />
                      <Label htmlFor="detect-phone" className={cn(
                        "text-sm font-medium",
                        !mappings.some(m => m.fieldName === 'phone') && "text-gray-400"
                      )}>
                        Phone {!mappings.some(m => m.fieldName === 'phone') && "(nicht gemappt)"}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="detect-none"
                        name="duplicateDetection"
                        value="none"
                        checked={duplicateConfig.duplicateDetectionField === 'none'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateDetectionField: e.target.value as 'name' | 'email' | 'phone' | 'none'
                        }))}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="detect-none" className="text-sm font-medium">
                        No duplicate detection
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Duplicate Action */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Action for Duplicates</CardTitle>
                  <p className="text-sm text-gray-600">Choose what to do when a duplicate is found</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="action-skip"
                        name="duplicateAction"
                        value="skip"
                        checked={duplicateConfig.duplicateAction === 'skip'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateAction: e.target.value as 'skip' | 'update' | 'create_new'
                        }))}
                        className="h-4 w-4"
                        disabled={duplicateConfig.duplicateDetectionField === 'none'}
                      />
                      <Label htmlFor="action-skip" className={cn(
                        "text-sm font-medium",
                        duplicateConfig.duplicateDetectionField === 'none' && "text-gray-400"
                      )}>
                        Skip duplicate
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="action-update"
                        name="duplicateAction"
                        value="update"
                        checked={duplicateConfig.duplicateAction === 'update'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateAction: e.target.value as 'skip' | 'update' | 'create_new'
                        }))}
                        className="h-4 w-4"
                        disabled={duplicateConfig.duplicateDetectionField === 'none'}
                      />
                      <Label htmlFor="action-update" className={cn(
                        "text-sm font-medium",
                        duplicateConfig.duplicateDetectionField === 'none' && "text-gray-400"
                      )}>
                        Update existing lead
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="radio"
                        id="action-create"
                        name="duplicateAction"
                        value="create_new"
                        checked={duplicateConfig.duplicateAction === 'create_new'}
                        onChange={(e) => setDuplicateConfig(prev => ({
                          ...prev,
                          duplicateAction: e.target.value as 'skip' | 'update' | 'create_new'
                        }))}
                        className="h-4 w-4"
                        disabled={duplicateConfig.duplicateDetectionField === 'none'}
                      />
                      <Label htmlFor="action-create" className={cn(
                        "text-sm font-medium",
                        duplicateConfig.duplicateDetectionField === 'none' && "text-gray-400"
                      )}>
                        Create new lead anyway
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary of Configuration */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-2">Configuration Summary</h4>
              <p className="text-sm text-blue-700">
                {duplicateConfig.duplicateDetectionField === 'none' 
                  ? "No duplicate detection will be performed. All leads will be imported as new entries."
                  : `Duplicates will be detected by comparing the "${duplicateConfig.duplicateDetectionField}" field. When a duplicate is found, the system will ${
                      duplicateConfig.duplicateAction === 'skip' 
                        ? 'skip the duplicate and continue with the next lead.'
                        : duplicateConfig.duplicateAction === 'update'
                        ? 'update the existing lead with new data from the CSV.'
                        : 'create a new lead despite the duplicate existing.'
                    }`
                }
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-700 rounded-md flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && (
          <div className="py-4 flex-1 overflow-hidden flex flex-col">
            <p className="text-sm text-gray-600 mb-4">
              Vorschau der ersten 5 zu importierenden Leads. Gesamt: {csvData.length} Leads.
            </p>

            <div className="flex-1 overflow-auto border rounded-md">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left sticky top-0 z-10">
                    <tr>
                      {mappings
                        .filter(m => m.fieldName || m.createCustomField)
                        .map((mapping, index) => (
                          <th key={index} className="px-3 py-2 font-medium text-gray-600 whitespace-nowrap w-40 max-w-40">
                            <div className="truncate" title={mapping.createCustomField 
                              ? `${mapping.fieldName} (Custom)` 
                              : allAvailableFields.find(f => f.name === mapping.fieldName)?.label || mapping.fieldName}>
                              {mapping.createCustomField 
                                ? `${mapping.fieldName} (Custom)` 
                                : allAvailableFields.find(f => f.name === mapping.fieldName)?.label || mapping.fieldName}
                            </div>
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {csvData.slice(0, 5).map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-gray-50">
                        {mappings
                          .filter(m => m.fieldName || m.createCustomField)
                          .map((mapping, colIndex) => {
                            const mappingIndex = mappings.findIndex(m => m.csvHeader === mapping.csvHeader);
                            const cellContent = row[mappingIndex] || '-';
                            return (
                              <td key={colIndex} className="px-3 py-2 text-gray-600 w-40 max-w-40">
                                <div className="truncate" title={cellContent}>
                                  {cellContent}
                                </div>
                              </td>
                            );
                          })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center">
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-6">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${importProgress}%` }}
              ></div>
            </div>
            <p className="text-gray-600">Importing leads... {importProgress}%</p>
          </div>
        )}

        <DialogFooter>
          {step !== 'importing' && (
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          )}

          {step === 'upload' && file && (
            <Button onClick={() => setStep('map')}>
              Continue
            </Button>
          )}

          {step === 'map' && (
            <Button onClick={handleContinueToDuplicates}>
              Continue to Duplicate Settings
            </Button>
          )}

          {step === 'duplicates' && (
            <Button onClick={handleContinueToPreview}>
              Preview Import
            </Button>
          )}

          {step === 'preview' && (
            <Button onClick={handleImport}>
              Import {csvData.length} Leads
            </Button>
          )}

          {step === 'importing' && importProgress === 100 && (
            <Button className="bg-green-600 hover:bg-green-700">
              <Check className="mr-2 h-4 w-4" />
              Import Complete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CSVImport;