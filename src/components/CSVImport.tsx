
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
    console.log('=== Building Lead Custom Fields ===');

    if (!customFields || !Array.isArray(customFields)) {
      console.log('No customFields available for processing');
      return [];
    }

    const leadFields = customFields
      .filter(field => {
        const isLead = field && field.entity_type === 'lead';
        console.log(`Field "${field?.name}" - is lead field:`, isLead);
        return isLead;
      })
      .map(field => {
        const processedField = {
          name: field.name.toLowerCase().replace(/\s+/g, '_'), // Standardized key
          label: `${field.name} (Custom)`,
          isCustom: true,
          originalName: field.name,
          fieldType: field.field_type
        };
        console.log('Processed custom field:', processedField);
        return processedField;
      });

    console.log('Final lead custom fields:', leadFields);
    console.log('=== End Building Lead Custom Fields ===');
    return leadFields;
  }, [customFields]);

  const allAvailableFields = React.useMemo(() => {
    console.log('=== Building All Available Fields ===');
    console.log('Standard fields:', standardFields);
    console.log('Lead custom fields to add:', leadCustomFields);

    const combined = [
      ...standardFields,
      ...leadCustomFields
    ];

    console.log('Combined available fields:', combined);
    console.log('=== End Building All Available Fields ===');
    return combined;
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
      setStep('importing');
      setImportProgress(0);

      const customFieldMappings = mappings.filter(m => m.createCustomField && m.fieldName);

      // Create new custom fields first
      for (const mapping of customFieldMappings) {
        if (mapping.fieldName) {
          try {
            await onAddCustomField(mapping.fieldName, mapping.customFieldType);
          } catch (error) {
            console.log('Custom field might already exist:', mapping.fieldName);
          }
        }
      }

      const leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[] = [];
      const duplicateNames: string[] = [];

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

        if (!lead.status) lead.status = 'potential';

        // Check if lead has required name field
        if (lead.name && lead.name.trim()) {
          leads.push(lead as Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>);
        }

        // Update progress
        setImportProgress(Math.round(((i + 1) / csvData.length) * 90));
      }

      console.log('Prepared leads for import:', leads.length);
      console.log('Sample lead:', leads[0]);

      try {
        // Get current user info for import job - with proper error handling
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.id) {
          console.error('Error getting user:', userError);
          setError('Fehler: Benutzer nicht gefunden. Bitte loggen Sie sich erneut ein.');
          setStep('preview');
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('team_id')
          .eq('id', user.id)
          .single();

        if (profileError || !profile?.team_id) {
          console.error('Error getting profile:', profileError);
          setError('Fehler: Team-Information nicht gefunden. Bitte kontaktieren Sie den Support.');
          setStep('preview');
          return;
        }

        console.log('=== IMPORT JOB CREATION START ===');
        console.log('User ID:', user.id);
        console.log('Team ID:', profile.team_id);
        console.log('File name:', file?.name);
        console.log('Total leads to import:', leads.length);

        // Create import job record BEFORE importing - this is critical for tracking
        const importJobData = {
          file_name: file?.name || 'unknown.csv',
          total_records: leads.length,
          processed_records: 0,
          failed_records: 0,
          status: 'processing',
          error_details: null,
          team_id: profile.team_id,
          created_by: user.id,
          undo_status: 'active'
        };

        console.log('Creating import job with data:', importJobData);

        // Create import job - MUST succeed for proper tracking
        const { data: importJob, error: jobError } = await supabase
          .from('import_jobs')
          .insert([importJobData])
          .select()
          .single();

        if (jobError || !importJob) {
          console.error('CRITICAL: Failed to create import job:', jobError);
          console.error('Job error details:', jobError?.details);
          console.error('Job error hint:', jobError?.hint);
          console.error('Job error code:', jobError?.code);
          setError(`Kritischer Fehler: Import-Job konnte nicht erstellt werden. ${jobError?.message || 'Unbekannter Fehler'}`);
          setStep('preview');
          return;
        }

        console.log('✅ Import job created successfully with ID:', importJob.id);
        console.log('Import job details:', importJob);
        console.log('=== IMPORT JOB CREATION SUCCESS ===')

        // Import all leads in batches to improve performance - silently in background
        let processedCount = 0;
        let failedCount = 0;
        const failedLeads: any[] = [];
        const batchSize = 100; // Larger batches for faster processing

        // Import all leads without showing individual toast messages
        const allLeadsToImport: typeof leads = [];

        for (let i = 0; i < leads.length; i += batchSize) {
          const batch = leads.slice(i, i + batchSize);

          try {
            // Collect leads for batch import without immediate UI updates
            allLeadsToImport.push(...batch);
            processedCount += batch.length;
          } catch (batchError: any) {
            console.error(`Failed to prepare batch ${Math.floor(i/batchSize) + 1}:`, batchError);
            failedCount += batch.length;
          }

          // Update progress
          const progress = Math.round(((i + batch.length) / leads.length) * 90);
          setImportProgress(progress);
        }

        // Now do the actual import in one go
        try {
          await onImport(allLeadsToImport);
          processedCount = allLeadsToImport.length;
          failedCount = 0;
        } catch (importError: any) {
          console.error('Batch import failed:', importError);
          // Try individual imports as fallback
          processedCount = 0;
          failedCount = 0;

          for (const lead of allLeadsToImport) {
            try {
              await onImport([lead]);
              processedCount++;
            } catch (leadError: any) {
              failedCount++;
              if (!leadError?.message?.includes('duplicate key')) {
                failedLeads.push({ 
                  lead: lead, 
                  error: leadError.message || 'Unknown error' 
                });
              }
            }
          }
        }

        // Update import job status - CRITICAL for import history
        console.log('=== UPDATING IMPORT JOB STATUS ===');
        console.log('Import job ID to update:', importJob.id);
        console.log('Processed records:', processedCount);
        console.log('Failed records:', failedCount);

        const finalStatus = failedCount > 0 ? 'completed_with_errors' : 'completed';
        const updateData = {
          processed_records: processedCount,
          failed_records: failedCount,
          status: finalStatus,
          error_details: failedLeads.length > 0 ? JSON.stringify(failedLeads.slice(0, 10)) : null,
          updated_at: new Date().toISOString()
        };

        console.log('Updating import job with:', updateData);

        const { error: updateError } = await supabase
          .from('import_jobs')
          .update(updateData)
          .eq('id', importJob.id);

        if (updateError) {
          console.error('CRITICAL: Failed to update import job status:', updateError);
          console.error('Update error details:', updateError.details);
          // Don't fail the import, but log the critical error
        } else {
          console.log('✅ Import job status updated successfully');
          console.log('Final import job status:', finalStatus);
          console.log('Import job ID:', importJob.id);
        }

        // Verify the import job was actually created and updated
        console.log('=== VERIFYING IMPORT JOB IN DATABASE ===');
        const { data: verifyJob, error: verifyError } = await supabase
          .from('import_jobs')
          .select('*')
          .eq('id', importJob.id)
          .single();

        if (verifyError) {
          console.error('ERROR: Could not verify import job in database:', verifyError);
        } else {
          console.log('✅ Import job verified in database:', verifyJob);
        }
        console.log('=== IMPORT JOB VERIFICATION COMPLETE ===')

        setImportProgress(100);

        // Show final import summary without toast notifications
        const totalLeads = processedCount + failedCount;
        let summaryMessage = '';

        if (failedCount === 0) {
          summaryMessage = `✅ Import erfolgreich abgeschlossen: ${processedCount} Leads wurden importiert.`;
        } else if (processedCount === 0) {
          summaryMessage = `❌ Import fehlgeschlagen: ${failedCount} Leads konnten nicht importiert werden.`;
        } else {
          summaryMessage = `⚠️ Import abgeschlossen: ${processedCount} Leads erfolgreich importiert, ${failedCount} fehlgeschlagen.`;
        }

        // Show result and close after delay
        setError(summaryMessage);

        setTimeout(() => {
          resetState();
          onClose();
        }, 4000); // Show result for 4 seconds to read the message

      } catch (importError: any) {
        console.error('Error importing leads:', importError);

        if (importError?.message?.includes('duplicate key')) {
          const duplicateName = importError.details?.match(/Key \(name\)=\((.*?)\)/)?.[1];
          if (duplicateName) {
            setError(`Ein Lead mit dem Namen "${duplicateName}" existiert bereits. Bitte entfernen Sie Duplikate aus Ihrer CSV-Datei oder verwenden Sie eine andere Namenskonvention.`);
          } else {
            setError('Einige Leads existieren bereits. Bitte überprüfen Sie Ihre CSV-Datei auf Duplikate.');
          }
        } else {
          setError(`Import-Fehler: ${importError?.message || 'Unbekannter Fehler beim Importieren der Leads.'}`);
        }
        setStep('preview');
      }
    } catch (error) {
      console.error('General error during import:', error);
      setError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
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
                            {(() => {
                              console.log('Rendering dropdown options for:', mapping.csvHeader);
                              console.log('Available fields for dropdown:', allAvailableFields);
                              return allAvailableFields.map(field => {
                                console.log('Adding dropdown option:', field);
                                return (
                                  <SelectItem key={field.name} value={field.name}>
                                    {field.label}
                                  </SelectItem>
                                );
                              });
                            })()}
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
