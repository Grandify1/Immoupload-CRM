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
        
        // Verbessertes CSV-Parsing für mehrzeilige Felder
        const parseCSVContent = (csvText: string): { headers: string[], data: string[][] } => {
          const result: string[][] = [];
          let current = '';
          let inQuotes = false;
          let row: string[] = [];
          
          for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = csvText[i + 1];
            
            if (char === '"') {
              if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++; // Skip next quote
              } else {
                // Toggle quote state
                inQuotes = !inQuotes;
              }
            } else if (char === ',' && !inQuotes) {
              // Field separator
              row.push(current.trim());
              current = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
              // Row separator (only when not in quotes)
              if (current.trim() !== '' || row.length > 0) {
                row.push(current.trim());
                if (row.some(field => field !== '')) { // Only add rows with content
                  result.push(row);
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
              result.push(row);
            }
          }
          
          if (result.length === 0) {
            throw new Error('Keine gültigen Zeilen gefunden');
          }
          
          const headers = result[0].map(h => h.replace(/^"|"$/g, '').trim());
          const data = result.slice(1);
          
          return { headers, data };
        };

        const { headers, data } = parseCSVContent(text);

        if (headers.some(header => header === '')) {
          setError('CSV-Datei enthält leere Spaltenüberschriften.');
          setStep('upload');
          return;
        }
        
        // Filtere und validiere Datenzeilen
        const validData = data.filter(row => {
          // Normalisiere Spaltenzahl
          while (row.length < headers.length) {
            row.push('');
          }
          if (row.length > headers.length) {
            row.splice(headers.length);
          }
          
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
        
        const initialMappings: MappingType[] = headers.map(header => {
          const matchedField = allAvailableFields.find(field => 
            field.label.toLowerCase() === header.toLowerCase() || 
            field.name.toLowerCase() === header.toLowerCase() ||
            (field.originalName && field.originalName.toLowerCase() === header.toLowerCase())
          );
          
          return {
            csvHeader: header,
            fieldName: matchedField ? matchedField.name : null,
            createCustomField: false,
            customFieldType: 'text'
          };
        });
        
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
        // Create import job record first
        const importJobData = {
          file_name: file?.name || 'unknown.csv',
          total_records: leads.length,
          processed_records: 0,
          failed_records: 0,
          status: 'processing' as const,
          error_details: null
        };
        
        console.log('Creating import job:', importJobData);
        
        let importJob: any = null;
        try {
          const { data, error: jobError } = await supabase
            .from('import_jobs')
            .insert(importJobData)
            .select()
            .single();
            
          if (jobError) {
            console.error('Error creating import job:', jobError);
          } else {
            importJob = data;
            console.log('Import job created:', importJob);
          }
        } catch (err) {
          console.error('Failed to create import job:', err);
        }
        
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
        
        // Update import job status
        if (importJob?.id) {
          try {
            await supabase
              .from('import_jobs')
              .update({
                processed_records: processedCount,
                failed_records: failedCount,
                status: failedCount > 0 ? 'completed_with_errors' : 'completed',
                error_details: failedLeads.length > 0 ? JSON.stringify(failedLeads.slice(0, 10)) : null
              })
              .eq('id', importJob.id);
          } catch (updateError) {
            console.error('Failed to update import job:', updateError);
          }
        }
        
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
