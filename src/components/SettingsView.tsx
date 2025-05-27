import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, MoveVertical, Edit, Check } from 'lucide-react';
import { CustomField, ActivityTemplate } from '@/types/database';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import SalesPipelineSettings from './settings/SalesPipelineSettings';

interface SettingsViewProps {
  customFields: CustomField[];
  activityTemplates: ActivityTemplate[];
  onAddCustomField: (field: Omit<CustomField, 'id' | 'team_id' | 'created_at'>) => Promise<void>;
  onUpdateCustomField: (id: string, updates: Partial<CustomField>) => Promise<void>;
  onDeleteCustomField: (id: string) => Promise<void>;
  onReorderCustomFields: (fields: CustomField[]) => Promise<void>;
  onAddActivityTemplate: (template: Omit<ActivityTemplate, 'id' | 'team_id' | 'created_at'>) => Promise<void>;
  onUpdateActivityTemplate: (id: string, updates: Partial<ActivityTemplate>) => Promise<void>;
  onDeleteActivityTemplate: (id: string) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  customFields,
  activityTemplates,
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields,
  onAddActivityTemplate,
  onUpdateActivityTemplate,
  onDeleteActivityTemplate
}) => {
  const [activeTab, setActiveTab] = useState('custom-fields');
  const [leadCustomFields, setLeadCustomFields] = useState<CustomField[]>([]);
  const [dealCustomFields, setDealCustomFields] = useState<CustomField[]>([]);
  const [templates, setTemplates] = useState<ActivityTemplate[]>([]);
  const { toast } = useToast();
  
  // Neue Feld-/Template-Formulare
  const [newFieldForm, setNewFieldForm] = useState({
    name: '',
    field_type: 'text' as 'text' | 'number' | 'date' | 'select' | 'checkbox',
    entity_type: 'lead' as 'lead' | 'deal',
    options: [] as string[],
    sort_order: 0
  });
  
  const [newTemplateForm, setNewTemplateForm] = useState({
    name: '',
    fields: [] as {
      name: string;
      type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
      options?: string[];
      required?: boolean;
    }[]
  });
  
  const [newTemplateField, setNewTemplateField] = useState({
    name: '',
    type: 'text' as 'text' | 'number' | 'date' | 'select' | 'checkbox',
    options: '',
    required: false
  });
  
  // Bearbeitungsstatus
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [showOptionInput, setShowOptionInput] = useState(false);
  const [newOption, setNewOption] = useState('');
  
  // Initialisieren der Daten
  useEffect(() => {
    setLeadCustomFields(customFields.filter(field => field.entity_type === 'lead')
      .sort((a, b) => a.sort_order - b.sort_order));
    setDealCustomFields(customFields.filter(field => field.entity_type === 'deal')
      .sort((a, b) => a.sort_order - b.sort_order));
    setTemplates(activityTemplates);
  }, [customFields, activityTemplates]);
  
  // Custom Field Funktionen
  const handleAddCustomField = async () => {
    try {
      await onAddCustomField({
        name: newFieldForm.name,
        field_type: newFieldForm.field_type,
        entity_type: newFieldForm.entity_type,
        options: newFieldForm.options,
        sort_order: newFieldForm.entity_type === 'lead' 
          ? leadCustomFields.length 
          : dealCustomFields.length
      });
      
      // Formular zurücksetzen
      setNewFieldForm({
        name: '',
        field_type: 'text',
        entity_type: 'lead',
        options: [],
        sort_order: 0
      });
    } catch (error) {
      console.error('Error adding custom field:', error);
    }
  };
  
  const handleUpdateCustomField = async (id: string, updates: Partial<CustomField>) => {
    try {
      await onUpdateCustomField(id, updates);
      setEditingFieldId(null);
    } catch (error) {
      console.error('Error updating custom field:', error);
    }
  };
  
  const handleDeleteCustomField = async (id: string) => {
    try {
      await onDeleteCustomField(id);
    } catch (error) {
      console.error('Error deleting custom field:', error);
    }
  };
  
  const handleAddOption = () => {
    if (newOption.trim()) {
      if (editingFieldId) {
        const field = customFields.find(f => f.id === editingFieldId);
        if (field) {
          const updatedOptions = [...field.options, newOption.trim()];
          handleUpdateCustomField(editingFieldId, { options: updatedOptions });
        }
      } else {
        setNewFieldForm(prev => ({
          ...prev,
          options: [...prev.options, newOption.trim()]
        }));
      }
      setNewOption('');
    }
  };
  
  const handleRemoveOption = (index: number) => {
    if (editingFieldId) {
      const field = customFields.find(f => f.id === editingFieldId);
      if (field) {
        const updatedOptions = [...field.options];
        updatedOptions.splice(index, 1);
        handleUpdateCustomField(editingFieldId, { options: updatedOptions });
      }
    } else {
      setNewFieldForm(prev => {
        const updatedOptions = [...prev.options];
        updatedOptions.splice(index, 1);
        return { ...prev, options: updatedOptions };
      });
    }
  };
  
  // Activity Template Funktionen
  const handleAddTemplateField = () => {
    if (newTemplateField.name.trim()) {
      const field = {
        name: newTemplateField.name,
        type: newTemplateField.type,
        required: newTemplateField.required
      } as any;
      
      if (newTemplateField.type === 'select' && newTemplateField.options) {
        field.options = newTemplateField.options.split(',').map(opt => opt.trim());
      }
      
      setNewTemplateForm(prev => ({
        ...prev,
        fields: [...prev.fields, field]
      }));
      
      // Zurücksetzen des Feldformulars
      setNewTemplateField({
        name: '',
        type: 'text',
        options: '',
        required: false
      });
    }
  };
  
  const handleRemoveTemplateField = (index: number) => {
    setNewTemplateForm(prev => {
      const updatedFields = [...prev.fields];
      updatedFields.splice(index, 1);
      return { ...prev, fields: updatedFields };
    });
  };
  
  const handleAddActivityTemplate = async () => {
    try {
      await onAddActivityTemplate({
        name: newTemplateForm.name,
        fields: newTemplateForm.fields
      });
      
      // Formular zurücksetzen
      setNewTemplateForm({
        name: '',
        fields: []
      });
    } catch (error) {
      console.error('Error adding activity template:', error);
    }
  };
  
  const handleDeleteActivityTemplate = async (id: string) => {
    try {
      await onDeleteActivityTemplate(id);
    } catch (error) {
      console.error('Error deleting activity template:', error);
    }
  };
  
  return (
    <div className="flex-1 p-6">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
          <TabsTrigger value="activity-templates">Activity Templates</TabsTrigger>
          <TabsTrigger value="sales-pipeline">Sales Pipeline</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="general">General Settings</TabsTrigger>
        </TabsList>
        
        {/* Custom Fields Tab */}
        <TabsContent value="custom-fields">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lead Custom Fields */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Lead Custom Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {leadCustomFields.map((field, index) => (
                    <div key={field.id} className="flex items-center justify-between p-3 border rounded-md">
                      {editingFieldId === field.id ? (
                        <div className="space-y-3 w-full">
                          <div className="flex items-center gap-2">
                            <Input 
                              value={field.name} 
                              onChange={(e) => {
                                const updatedFields = [...leadCustomFields];
                                updatedFields[index] = { ...field, name: e.target.value };
                                setLeadCustomFields(updatedFields);
                              }} 
                              className="flex-1"
                            />
                            <Select 
                              value={field.field_type}
                              onValueChange={(value) => {
                                const updatedFields = [...leadCustomFields];
                                updatedFields[index] = { 
                                  ...field, 
                                  field_type: value as any,
                                  options: value === 'select' ? field.options : [] 
                                };
                                setLeadCustomFields(updatedFields);
                              }}
                            >
                              <SelectTrigger className="w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="date">Date</SelectItem>
                                <SelectItem value="select">Dropdown</SelectItem>
                                <SelectItem value="checkbox">Checkbox</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {field.field_type === 'select' && (
                            <div className="space-y-2">
                              <Label>Options</Label>
                              <div className="flex flex-wrap gap-2">
                                {field.options.map((option, optIndex) => (
                                  <div key={optIndex} className="flex items-center bg-gray-100 rounded-full px-3 py-1">
                                    <span className="text-sm">{option}</span>
                                    <button 
                                      onClick={() => handleRemoveOption(optIndex)}
                                      className="ml-2 text-gray-500 hover:text-red-500"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2">
                                <Input 
                                  value={newOption}
                                  onChange={(e) => setNewOption(e.target.value)}
                                  placeholder="Add option"
                                  className="flex-1"
                                />
                                <Button size="sm" onClick={handleAddOption}>Add</Button>
                              </div>
                            </div>
                          )}
                          
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setEditingFieldId(null)}
                            >
                              Cancel
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleUpdateCustomField(field.id, {
                                name: field.name,
                                field_type: field.field_type,
                                options: field.options
                              })}
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center">
                            <MoveVertical className="w-4 h-4 text-gray-400 mr-2 cursor-move" />
                            <div>
                              <p className="font-medium">{field.name}</p>
                              <p className="text-xs text-gray-500">Type: {field.field_type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setEditingFieldId(field.id)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDeleteCustomField(field.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  
                  {/* Add New Field Form */}
                  <div className="border rounded-md p-4">
                    <h3 className="font-medium mb-3">Add New Field</h3>
                    <div className="space-y-3">
                      <div>
                        <Label>Field Name</Label>
                        <Input 
                          value={newFieldForm.name}
                          onChange={(e) => setNewFieldForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g. Company Size"
                        />
                      </div>
                      <div>
                        <Label>Field Type</Label>
                        <Select 
                          value={newFieldForm.field_type}
                          onValueChange={(value) => {
                            setNewFieldForm(prev => ({ 
                              ...prev, 
                              field_type: value as any,
                              options: value === 'select' ? prev.options : []
                            }));
                            setShowOptionInput(value === 'select');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="select">Dropdown</SelectItem>
                            <SelectItem value="checkbox">Checkbox</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {showOptionInput && (
                        <div className="space-y-2">
                          <Label>Options</Label>
                          <div className="flex flex-wrap gap-2">
                            {newFieldForm.options.map((option, index) => (
                              <div key={index} className="flex items-center bg-gray-100 rounded-full px-3 py-1">
                                <span className="text-sm">{option}</span>
                                <button 
                                  onClick={() => handleRemoveOption(index)}
                                  className="ml-2 text-gray-500 hover:text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input 
                              value={newOption}
                              onChange={(e) => setNewOption(e.target.value)}
                              placeholder="Add option"
                              className="flex-1"
                            />
                            <Button size="sm" onClick={handleAddOption}>Add</Button>
                          </div>
                        </div>
                      )}
                      
                      <div className="pt-2">
                        <Button 
                          onClick={handleAddCustomField}
                          disabled={!newFieldForm.name.trim() || (newFieldForm.field_type === 'select' && newFieldForm.options.length === 0)}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Field
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Deal Custom Fields */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Deal Custom Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {dealCustomFields.map((field, index) => (
                    <div key={field.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex items-center">
                        <MoveVertical className="w-4 h-4 text-gray-400 mr-2 cursor-move" />
                        <div>
                          <p className="font-medium">{field.name}</p>
                          <p className="text-xs text-gray-500">Type: {field.field_type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setEditingFieldId(field.id)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteCustomField(field.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Activity Templates Tab */}
        <TabsContent value="activity-templates">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Existing Templates */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Activity Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {templates.map((template) => (
                    <div key={template.id} className="border rounded-md p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium">{template.name}</h3>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteActivityTemplate(template.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {template.fields.map((field, index) => (
                          <div key={index} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                            <div>
                              <span className="font-medium">{field.name}</span>
                              <span className="text-xs text-gray-500 ml-2">({field.type})</span>
                              {field.required && <span className="text-xs text-red-500 ml-1">*</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Add New Template */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Create New Template</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label>Template Name</Label>
                    <Input 
                      value={newTemplateForm.name}
                      onChange={(e) => setNewTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Customer Onboarding"
                    />
                  </div>
                  
                  <div className="border-t pt-4">
                    <h3 className="font-medium mb-3">Template Fields</h3>
                    
                    {newTemplateForm.fields.map((field, index) => (
                      <div key={index} className="flex items-center justify-between mb-2 p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">{field.name}</span>
                          <span className="text-xs text-gray-500 ml-2">({field.type})</span>
                          {field.required && <span className="text-xs text-red-500 ml-1">*</span>}
                        </div>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleRemoveTemplateField(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    
                    <div className="border rounded-md p-3 mt-3">
                      <h4 className="text-sm font-medium mb-2">Add Field</h4>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Field Name</Label>
                            <Input 
                              value={newTemplateField.name}
                              onChange={(e) => setNewTemplateField(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="e.g. Notes"
                              className="text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Field Type</Label>
                            <Select 
                              value={newTemplateField.type}
                              onValueChange={(value) => setNewTemplateField(prev => ({ 
                                ...prev, 
                                type: value as any,
                                options: value === 'select' ? prev.options : ''
                              }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="date">Date</SelectItem>
                                <SelectItem value="select">Dropdown</SelectItem>
                                <SelectItem value="checkbox">Checkbox</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        
                        {newTemplateField.type === 'select' && (
                          <div>
                            <Label className="text-xs">Options (comma separated)</Label>
                            <Input 
                              value={newTemplateField.options}
                              onChange={(e) => setNewTemplateField(prev => ({ ...prev, options: e.target.value }))}
                              placeholder="Option 1, Option 2, Option 3"
                              className="text-sm"
                            />
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="required-field"
                            checked={newTemplateField.required}
                            onCheckedChange={(checked) => 
                              setNewTemplateField(prev => ({ ...prev, required: checked }))
                            }
                          />
                          <Label htmlFor="required-field" className="text-xs">Required Field</Label>
                        </div>
                        
                        <Button 
                          size="sm" 
                          onClick={handleAddTemplateField}
                          disabled={!newTemplateField.name.trim()}
                        >
                          Add Field
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleAddActivityTemplate}
                    disabled={!newTemplateForm.name.trim() || newTemplateForm.fields.length === 0}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        {/* Sales Pipeline Tab */}
        <TabsContent value="sales-pipeline">
          <SalesPipelineSettings />
        </TabsContent>
        
        {/* Import Tab */}
        <TabsContent value="import">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Import Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Import leads from CSV files. Make sure your CSV includes columns for name, email, phone, and status.
                  </p>
                  <Button className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Import Leads from CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Import Opportunities</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Import opportunities/deals from CSV files. Include columns for title, value, stage, and associated lead.
                  </p>
                  <Button className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Import Opportunities from CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Import Guidelines</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-sm">For Leads:</h4>
                  <p className="text-xs text-gray-600">Required columns: name, email. Optional: phone, status, custom fields</p>
                </div>
                <div>
                  <h4 className="font-medium text-sm">For Opportunities:</h4>
                  <p className="text-xs text-gray-600">Required columns: title, value. Optional: stage, lead_id, custom fields</p>
                </div>
                <div>
                  <h4 className="font-medium text-sm">File Format:</h4>
                  <p className="text-xs text-gray-600">CSV files with UTF-8 encoding. First row should contain column headers.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* General Settings Tab */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Dark Mode</h3>
                    <p className="text-sm text-gray-500">Enable dark mode for the application</p>
                  </div>
                  <Switch id="dark-mode" />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Email Notifications</h3>
                    <p className="text-sm text-gray-500">Receive email notifications for important events</p>
                  </div>
                  <Switch id="email-notifications" defaultChecked />
                </div>
                
                <div className="pt-4">
                  <h3 className="font-medium mb-2">Default View</h3>
                  <Select defaultValue="table">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="table">Table View</SelectItem>
                      <SelectItem value="kanban">Kanban View</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SettingsView;
