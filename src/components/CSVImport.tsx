
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, X, AlertCircle, Check, Plus } from 'lucide-react';
import { Lead, CustomField } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';

interface CSVImportProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[]) => Promise<void>;
  onAddCustomField: (name: string, type: string) => Promise<void>;
  customFields?: CustomField[];
}

type MappingType = {
  csvHeader: string;
  fieldName: string | null;
  createCustomField: boolean;
  customFieldType: 'text' | 'number' | 'date' | 'select';
};

const CSVImport: React.FC<CSVImportProps> = ({ isOpen, onClose, onImport, onAddCustomField, customFields }) => {

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
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'importing'>('upload');
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
            'website': ['website', 'webseite', 'homepage', 'url', 'web', 'link', 'site'],
            'address': ['address', 'adresse', 'anschrift', 'standort', 'ort', 'location'],
            'description': ['description', 'beschreibung', 'info', 'information', 'details', 'kommentar'],
            'status': ['status', 'zustand', 'state', 'stage'],

            // Spezielle Felder aus Google Maps Daten
            'reviews': ['reviews', 'bewertungen', 'anzahl_bewertungen', 'review_count'],
            'rating': ['rating', 'bewertung', 'sterne', 'stars', 'durchschnitt'],
            'category': ['category', 'kategorie', 'main_category', 'hauptkategorie', 'branche'],
            'competitors': ['competitors', 'konkurrenz', 'wettbewerber'],
            'opening_hours': ['opening_hours', 'oeffnungszeiten', 'workday_timing', 'arbeitszeiten'],
            'owner': ['owner', 'besitzer', 'eigentumer', 'owner_name', 'inhaber'],
            'place_id': ['place_id', 'id', 'google_place_id'],
            'featured_image': ['featured_image', 'image', 'bild', 'foto'],
            'can_claim': ['can_claim', 'beanspruchbar'],
            'is_closed': ['is_closed', 'geschlossen', 'is_temporarily_closed'],
            'keywords': ['keywords', 'schlusselworter', 'review_keywords', 'suchbegriffe']
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

  const handleContinueToPreview = () => {
    const hasNameMapping = mappings.some(m => m.fieldName === 'name');

    if (!hasNameMapping) {
      setError('You must map the "Name" field to continue.');
      return;
    }

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

      // Now perform the actual import
      console.log('=== STARTING LEAD IMPORT ===');
      const batchSize = 100;
      let batchIndex = 0;
      let totalBatches = Math.ceil(leads.length / batchSize);
      let processedRecords = 0;
      let failedRecords = 0;

      // Split leads into batches for more efficient insertion
      for (let i = 0; i < leads.length; i += batchSize) {
        const batch = leads.slice(i, i + batchSize);
        batchIndex = Math.floor(i / batchSize);

        // Insert leads in batches using Supabase
        console.log(`=== INSERTING BATCH ${batchIndex + 1}/${totalBatches} (${batch.length} leads) TO SUPABASE ===`);

        const { data: insertedLeads, error: insertError } = await supabase
          .from('leads')
          .insert(batch)
          .select('id');

        if (insertError) {
          console.error(`❌ Supabase error inserting batch ${batchIndex + 1}:`, insertError);
          console.error('Error details:', insertError.details);
          console.error('Error hint:', insertError.hint);
          console.error('Error code:', insertError.code);
          failedRecords += batch.length;

          // Update import job with error in Supabase (only if job tracking is available)
          if (!skipJobTracking && importJob) {
            try {
              await supabase
                .from('import_jobs')
                .update({
                  failed_records: failedRecords,
                  error_details: { 
                    batch: batchIndex + 1,
                    error: insertError.message,
                    details: insertError.details || 'Unknown Supabase error'
                  }
                })
                .eq('id', importJob.id);
            } catch (updateError) {
              console.warn('⚠️ Could not update import job status:', updateError);
            }
          }

          continue;
        }

        console.log(`✅ Successfully inserted batch ${batchIndex + 1} to Supabase, ${insertedLeads?.length || 0} leads`);
        processedRecords += insertedLeads?.length || 0;

        // Update progress
        setImportProgress(45 + Math.round(((i + batchSize) / leads.length) * 45));
      }

      setImportProgress(95);

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

      // Show final result
      let summaryMessage = '';
      if (failedRecords === 0) {
        summaryMessage = `✅ Import erfolgreich: ${processedRecords} Leads importiert.`;
      } else if (processedRecords === 0) {
        summaryMessage = `❌ Import fehlgeschlagen: ${failedRecords} Leads konnten nicht importiert werden.`;
      } else {
        summaryMessage = `⚠️ Import abgeschlossen: ${processedRecords} erfolgreich, ${failedRecords} fehlgeschlagen.`;
      }

      console.log('=== IMPORT COMPLETE ===');
      console.log('Final result:', summaryMessage);

      // Show success message instead of error
      setError(summaryMessage);

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
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
