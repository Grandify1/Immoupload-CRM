import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Upload, X, AlertCircle, Check, Plus } from 'lucide-react';
import { Lead, CustomField } from '@/types/database';

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

  const allAvailableFields = [
    ...standardFields,
    ...(customFields || []).filter(field => field.entity_type === 'lead').map(field => ({
        name: field.name.toLowerCase().replace(/\s+/g, '_'),
        label: field.name,
    }))
  ];

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
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) {
          setError('CSV-Datei ist leer.');
          setStep('upload');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim());

        if (headers.some(header => header === '')) {
          setError('CSV-Datei enthält leere Spaltenüberschriften.');
          setStep('upload');
          return;
        }
        
        const data: string[][] = [];
        for (let i = 1; i < lines.length; i++) {
          if (lines[i].trim() === '') continue;
          const values = lines[i].split(',').map(v => v.trim());
          
          if (values.length !== headers.length) {
             console.warn(`Skipping row ${i + 1} due to incorrect number of columns.`);
             continue;
          }
          data.push(values);
        }

        if (data.length === 0) {
            setError('CSV-Datei enthält keine Datenzeilen.');
            setStep('upload');
            return;
        }
        
        setHeaders(headers);
        setCSVData(data);
        
        const initialMappings: MappingType[] = headers.map(header => {
          const matchedField = allAvailableFields.find(field => 
            field.label.toLowerCase() === header.toLowerCase() || 
            field.name.toLowerCase() === header.toLowerCase()
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
      
      for (const mapping of customFieldMappings) {
        if (mapping.fieldName) {
          await onAddCustomField(mapping.fieldName, mapping.customFieldType);
        }
      }
      
      const leads: Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>[] = csvData.map(row => {
        const lead: any = {
          custom_fields: {}
        };
        
        mappings.forEach((mapping, index) => {
          if (mapping.fieldName && index < row.length) {
            const value = row[index];
            
            const targetField = allAvailableFields.find(f => f.name === mapping.fieldName);

            if (targetField && standardFields.some(sf => sf.name === targetField.name)) {
               if (targetField.name === 'status' && !['potential', 'contacted', 'qualified', 'closed'].includes(value)) {
                 lead[targetField.name] = 'potential';
               } else {
                 lead[targetField.name] = value;
               }
            } else if (mapping.createCustomField) {
              lead.custom_fields[mapping.fieldName] = value;
            } else if (targetField) {
              lead.custom_fields[targetField.name] = value;
            }
          }
        });
        
        if (!lead.status) lead.status = 'potential';
        
        return lead as Omit<Lead, 'id' | 'team_id' | 'created_at' | 'updated_at'>;
      });
      
      await onImport(leads);
      
      setImportProgress(100);
      setTimeout(() => {
        resetState();
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error importing leads:', error);
      setError('Failed to import leads. Please try again.');
      setStep('preview');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
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
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Map the CSV columns to lead fields. You can also create custom fields for unmapped columns.
            </p>
            
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full">
                <thead className="bg-gray-50 text-left">
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
                          onValueChange={(value) => handleMappingChange(index, value === '__skip__' ? null : value)}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a field" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__skip__">Do not import</SelectItem>
                            {allAvailableFields.map(field => (
                              <SelectItem key={field.name} value={field.name}>
                                {field.label}
                              </SelectItem>
                            ))}
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
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">
              Preview of the first 5 leads to be imported. Total: {csvData.length} leads.
            </p>
            
            <div className="max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    {mappings
                      .filter(m => m.fieldName || m.createCustomField)
                      .map((mapping, index) => (
                        <th key={index} className="px-3 py-2 font-medium text-gray-600">
                          {mapping.createCustomField 
                            ? `${mapping.fieldName} (Custom)` 
                            : allAvailableFields.find(f => f.name === mapping.fieldName)?.label || mapping.fieldName}
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
                          return (
                            <td key={colIndex} className="px-3 py-2 text-gray-600">
                              {row[mappingIndex] || '-'}
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
