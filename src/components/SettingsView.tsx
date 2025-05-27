import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomField, ActivityTemplate } from '@/types/database';
import { Plus, Trash2, Settings, Users, Briefcase } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface SettingsViewProps {
  customFields?: CustomField[];
  activityTemplates?: ActivityTemplate[];
  onAddCustomField?: (field: Omit<CustomField, 'id' | 'team_id' | 'created_at'>) => Promise<void>;
  onUpdateCustomField?: (id: string, field: Partial<CustomField>) => Promise<void>;
  onDeleteCustomField?: (id: string) => Promise<void>;
  onReorderCustomFields?: (fields: CustomField[]) => Promise<void>;
  onAddActivityTemplate?: (template: Omit<ActivityTemplate, 'id' | 'team_id' | 'created_at'>) => Promise<void>;
  onUpdateActivityTemplate?: (id: string, template: Partial<ActivityTemplate>) => Promise<void>;
  onDeleteActivityTemplate?: (id: string) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  customFields = [],
  activityTemplates = [],
  onAddCustomField,
  onUpdateCustomField,
  onDeleteCustomField,
  onReorderCustomFields,
  onAddActivityTemplate,
  onUpdateActivityTemplate,
  onDeleteActivityTemplate
}) => {
  const [showNewFieldDialog, setShowNewFieldDialog] = useState(false);
  const [showNewTemplateDialog, setShowNewTemplateDialog] = useState(false);
  const [newField, setNewField] = useState({
    name: '',
    field_type: 'text' as 'text' | 'number' | 'date' | 'select' | 'checkbox',
    entity_type: 'lead' as 'lead' | 'deal',
    options: [] as string[],
    sort_order: 0
  });
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    default_duration: 30,
    is_system: false
  });
  const { toast } = useToast();

  const handleAddCustomField = async () => {
    if (!onAddCustomField || !newField.name) return;

    try {
      await onAddCustomField(newField);
      setNewField({
        name: '',
        field_type: 'text',
        entity_type: 'lead',
        options: [],
        sort_order: 0
      });
      setShowNewFieldDialog(false);
      toast({
        title: 'Success',
        description: 'Custom field added successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add custom field',
        variant: 'destructive'
      });
    }
  };

  const handleAddActivityTemplate = async () => {
    if (!onAddActivityTemplate || !newTemplate.name) return;

    try {
      await onAddActivityTemplate(newTemplate);
      setNewTemplate({
        name: '',
        description: '',
        default_duration: 30,
        is_system: false
      });
      setShowNewTemplateDialog(false);
      toast({
        title: 'Success',
        description: 'Activity template added successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add activity template',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!onDeleteCustomField) return;

    try {
      await onDeleteCustomField(fieldId);
      toast({
        title: 'Success',
        description: 'Custom field deleted successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete custom field',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="flex-1 p-6 h-full overflow-y-auto">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold flex items-center">
          <Settings className="w-6 h-6 mr-2" />
          Settings
        </h1>

        <Tabs defaultValue="custom-fields" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="custom-fields">Custom Fields</TabsTrigger>
            <TabsTrigger value="activity-templates">Activity Templates</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="custom-fields" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Custom Fields</CardTitle>
                <Button onClick={() => setShowNewFieldDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Field
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {customFields.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No custom fields yet. Add one to get started.
                    </p>
                  ) : (
                    customFields.map((field) => (
                      <div key={field.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          {field.entity_type === 'lead' ? (
                            <Users className="w-5 h-5 text-blue-500" />
                          ) : (
                            <Briefcase className="w-5 h-5 text-green-500" />
                          )}
                          <div>
                            <h3 className="font-medium">{field.name}</h3>
                            <p className="text-sm text-gray-500">
                              {field.field_type} • {field.entity_type}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteField(field.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity-templates" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Activity Templates</CardTitle>
                <Button onClick={() => setShowNewTemplateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Template
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activityTemplates.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">
                      No activity templates yet. Add one to get started.
                    </p>
                  ) : (
                    activityTemplates.map((template) => (
                      <div key={template.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <h3 className="font-medium">{template.name}</h3>
                          <p className="text-sm text-gray-500">{template.description}</p>
                          <p className="text-xs text-gray-400">
                            Default duration: {template.default_duration} minutes
                          </p>
                        </div>
                        {!template.is_system && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteActivityTemplate?.(template.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <Label>Application Settings</Label>
                    <p className="text-sm text-gray-500 mt-1">
                      Configure general application settings and preferences.
                    </p>
                  </div>
                  {/* Add more general settings here as needed */}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Custom Field Dialog */}
        <Dialog open={showNewFieldDialog} onOpenChange={setShowNewFieldDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add Custom Field</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="field-name">Field Name</Label>
                <Input
                  id="field-name"
                  value={newField.name}
                  onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                  placeholder="e.g. Budget"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="field-type">Field Type</Label>
                <Select
                  value={newField.field_type}
                  onValueChange={(value: any) => setNewField({ ...newField, field_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select field type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                    <SelectItem value="checkbox">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="entity-type">Apply To</Label>
                <Select
                  value={newField.entity_type}
                  onValueChange={(value: any) => setNewField({ ...newField, entity_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Leads</SelectItem>
                    <SelectItem value="deal">Deals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewFieldDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddCustomField} disabled={!newField.name}>
                Add Field
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Activity Template Dialog */}
        <Dialog open={showNewTemplateDialog} onOpenChange={setShowNewTemplateDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add Activity Template</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                  placeholder="e.g. Follow-up Call"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-description">Description</Label>
                <Input
                  id="template-description"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                  placeholder="Brief description of this activity"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-duration">Default Duration (minutes)</Label>
                <Input
                  id="template-duration"
                  type="number"
                  value={newTemplate.default_duration}
                  onChange={(e) => setNewTemplate({ ...newTemplate, default_duration: parseInt(e.target.value) || 30 })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewTemplateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddActivityTemplate} disabled={!newTemplate.name}>
                Add Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};