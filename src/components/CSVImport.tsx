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
  const [isImporting, setIsImporting] = useState(false);

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

  // Custom Fields für Leads mit verbesserter Verarbeitung und Error Handling
  const leadCustomFields = React.useMemo(() => {
    try {
      console.log('=== PROCESSING LEAD CUSTOM FIELDS ===');
      console.log('Raw customFields:', customFields);

      if (!customFields || !Array.isArray(customFields)) {
        console.log('No custom fields or not array');
        return [];
      }

      const leadFields = customFields
        .filter(field => {
          const isValid = field && field.entity_type === 'lead' && field.name;
          if (!isValid) {
            console.log('Filtering out invalid field:', field);
          }
          return isValid;
        })
        .map((field, index) => {
          try {
            // Safe field name processing
            const safeName = field.name
              .replace(/[äöüÄÖÜß]/g, (match) => {
                const replacements = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
                return replacements[match] || match;
              })
              .toLowerCase()
              .replace(/\s+/g, '_')
              .replace(/[^\w\-_.]/g, '_')
              .replace(/_+/g, '_')
              .replace(/^_|_$/g, '');

            const processedField = {
              name: safeName || `custom_field_${index}`,
              label: `${field.name} (Custom)`,
              isCustom: true,
              originalName: field.name,
              fieldType: field.field_type
            };

            console.log('Processed custom field:', processedField);
            return processedField;
          } catch (error) {
            console.error('Error processing custom field:', field, error);
            return {
              name: `error_field_${index}`,
              label: `Error Field ${index} (Custom)`,
              isCustom: true,
              originalName: `Error Field ${index}`,
              fieldType: 'text'
            };
          }
        });

      console.log('Final lead custom fields:', leadFields);
      console.log('=== END PROCESSING LEAD CUSTOM FIELDS ===');
      return leadFields;
    } catch (error) {
      console.error('❌ Critical error in leadCustomFields memo:', error);
      console.error('Error stack:', error.stack);
      return [];
    }
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
    setIsImporting(false);
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
              'name': ['name', 'namen', 'firmenname', 'firma', 'unternehmen', 'company', 'business_name', 'title'],
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
    try {
      console.log('=== HANDLE MAPPING CHANGE DEBUG ===');
      console.log('Original fieldName:', fieldName);
      console.log('Index:', index);

      const newMappings = [...mappings];

      // Enhanced sanitization to prevent URI malformed errors
      let sanitizedFieldName = null;
      if (fieldName && fieldName !== '__skip__') {
        // More aggressive sanitization
        sanitizedFieldName = fieldName
          .replace(/[äöüÄÖÜß]/g, (match) => {
            const replacements = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
            return replacements[match] || match;
          })
          .replace(/[^\w\-_.]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .toLowerCase();

        // Ensure it's not empty after sanitization
        if (!sanitizedFieldName) {
          sanitizedFieldName = `field_${index}`;
        }
      }

      console.log('Sanitized fieldName:', sanitizedFieldName);

      newMappings[index].fieldName = sanitizedFieldName;
      newMappings[index].createCustomField = false;

      console.log('Updated mapping:', newMappings[index]);
      console.log('=== END HANDLE MAPPING CHANGE DEBUG ===');

      setMappings(newMappings);
    } catch (error) {
      console.error('❌ Error in handleMappingChange:', error);
      console.error('Error stack:', error.stack);

      // Fallback: Set safe default
      const newMappings = [...mappings];
      newMappings[index].fieldName = `safe_field_${index}`;
      newMappings[index].createCustomField = false;
      setMappings(newMappings);
    }
  };

  const handleCustomFieldToggle = (index: number, checked: boolean) => {
    const newMappings = [...mappings];
    newMappings[index].createCustomField = checked;
    if (checked && !newMappings[index].fieldName) {
      // Properly sanitize field name to prevent URI errors
      const sanitizedName = newMappings[index].csvHeader
        .toLowerCase()
        .replace(/[äöüß]/g, (match) => ({ 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss' }[match] || match))
        .replace(/[^\w\-_.]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
      newMappings[index].fieldName = sanitizedName;
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
      setError('Sie müssen das "Name" Feld zuordnen, um fortzufahren. Wählen Sie eine Spalte aus, die als Name verwendet werden soll.');
      return;
    }

    console.log('Name mapping found:', mappings.filter(m => m.fieldName === 'name'));
    setError(null);
    setStep('duplicates');
  };

  const handleContinueToPreview = () => {
    setError(null);
    setStep('preview');
  };

  const handleImport = async () => {
    try {
      setError(null);
      setIsImporting(true);

      const { toast } = await import('sonner');
      const { SimpleCSVImportService } = await import('@/services/csvImportService');

      // Get current user info
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        setError(`Authentifizierungsfehler: ${userError.message}`);
        return;
      }

      if (!user?.id) {
        setError('Benutzer nicht gefunden. Bitte loggen Sie sich erneut ein.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('team_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.team_id) {
        setError('Team-Information nicht gefunden. Bitte kontaktieren Sie den Support.');
        return;
      }

      // Create custom fields first
      const customFieldMappings = mappings.filter(m => m.createCustomField && m.fieldName);
      for (const mapping of customFieldMappings) {
        if (mapping.fieldName) {
          try {
            await onAddCustomField(mapping.fieldName, mapping.customFieldType);
          } catch (error) {
            console.log('Custom field might already exist:', mapping.fieldName);
          }
        }
      }

      // Show initial toast
      toast.info('CSV Import gestartet', {
        description: `${csvData.length} Leads werden verarbeitet...`,
        duration: 3000,
      });

      // Close modal immediately
      resetState();
      onClose();
      
      // Start import with progress callback
      const result = await SimpleCSVImportService.processCSVImport(
        csvData,
        mappings,
        duplicateConfig,
        profile.team_id,
        user.id,
        (progress, message) => {
          console.log(`${progress}%: ${message}`);
          // Don't show progress toasts, just log them
        }
      );

      // Show final results
      if (result.failedRecords > 0) {
        toast.warning('Import mit Fehlern abgeschlossen', {
          description: `${result.processedRecords} Leads verarbeitet (${result.newRecords} neu, ${result.updatedRecords} aktualisiert, ${result.failedRecords} Fehler)`,
          duration: 6000,
        });
      } else {
        toast.success('Import erfolgreich abgeschlossen!', {
          description: `${result.processedRecords} Leads erfolgreich importiert (${result.newRecords} neu, ${result.updatedRecords} aktualisiert)`,
          duration: 5000,
        });
      }

      // Trigger refresh
      if (onRefresh) {
        onRefresh();
        setTimeout(() => onRefresh(), 2000);
      }

    } catch (error: any) {
      console.error('Import Error:', error);
      
      const { toast } = await import('sonner');
      toast.error('Import fehlgeschlagen', {
        description: error.message,
        duration: 4000,
      });

      // Don't go back to preview step, just close
      resetState();
      onClose();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
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
                            try {
                              console.log('=== SELECT FIELD MAPPING DEBUG ===');
                              console.log('Raw select value:', value);
                              console.log('CSV column:', mapping.csvHeader);
                              console.log('Current mapping:', mapping);

                              const processedValue = value === '__skip__' ? null : value;
                              console.log('Processed value:', processedValue);

                              handleMappingChange(index, processedValue);
                              console.log('=== END SELECT FIELD MAPPING DEBUG ===');
                            } catch (error) {
                              console.error('❌ CRITICAL ERROR in Select onValueChange:', error);
                              console.error('Error details:', {
                                value,
                                index,
                                csvHeader: mapping.csvHeader,
                                stack: error.stack
                              });

                              // Emergency fallback
                              try {
                                const emergencyValue = value === '__skip__' ? null : `emergency_field_${index}`;
                                handleMappingChange(index, emergencyValue);
                              } catch (fallbackError) {
                                console.error('❌ Even fallback failed:', fallbackError);
                                setError('Kritischer Fehler bei der Feldzuordnung. Seite wird neu geladen.');
                                setTimeout(() => window.location.reload(), 2000);
                              }
                            }
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
                                try {
                                  console.log('=== CUSTOM FIELD INPUT DEBUG ===');
                                  console.log('Input value:', e.target.value);

                                  const newMappings = [...mappings];

                                  // Enhanced sanitization to prevent URI errors
                                  const sanitizedValue = e.target.value
                                    .replace(/[äöüÄÖÜß]/g, (match) => {
                                      const replacements = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
                                      return replacements[match] || match;
                                    })
                                    .replace(/[^\w\-_.]/g, '_')
                                    .replace(/_+/g, '_')
                                    .replace(/^_|_$/g, '')
                                    .toLowerCase();

                                  console.log('Sanitized value:', sanitizedValue);

                                  newMappings[index].fieldName = sanitizedValue;
                                  setMappings(newMappings);

                                  console.log('Updated mapping:', newMappings[index]);
                                  console.log('=== END CUSTOM FIELD INPUT DEBUG ===');
                                } catch (error) {
                                  console.error('❌ Error in custom field input:', error);
                                  console.error('Error stack:', error.stack);

                                  // Set safe fallback
                                  const newMappings = [...mappings];
                                  newMappings[index].fieldName = `custom_field_${index}`;
                                  setMappings(newMappings);
                                }
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
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Vorschau der ersten 5 zu importierenden Leads. Gesamt: {csvData.length} Leads.
              </p>
              {csvData.length > 1000 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-700">
                    <strong>Großer Import erkannt:</strong> {csvData.length} Leads werden in Batches von 100 verarbeitet. 
                    Sie können den Fortschritt in der unteren rechten Ecke verfolgen.
                  </p>
                </div>
              )}
            </div>

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

        

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>

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
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Wird importiert...
                </>
              ) : (
                `Import ${csvData.length} Leads`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CSVImport;