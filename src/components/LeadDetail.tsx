import React, { useState, useEffect } from 'react';
import { 
  X, 
  Phone, 
  Mail, 
  MessageSquare,
  MapPin,
  Globe,
  Edit2,
  Send,
  ArrowRight,
  Plus,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Trash2,
  StickyNote,
  User,
  FolderOpen,
  Briefcase
} from 'lucide-react';
import { Lead, Activity, CustomField, ActivityTemplate } from '@/types/database';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useProfile } from '@/hooks/useProfile';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface LeadDetailProps {
  lead: Lead;
  onClose: () => void;
  onAddActivity: (activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => void;
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  onConvertToDeal: (lead: Lead) => Promise<any | null>;
  allLeads: Lead[];
  onLeadSelect: (lead: Lead) => void;
  customFields?: CustomField[];
  activityTemplates?: ActivityTemplate[];
  onDeleteActivity: (activityId: string, entityType: string, entityId: string) => void;
  isOpen: boolean;
  onAddCustomField?: (field: Omit<CustomField, 'id'>) => Promise<void>;
  onShowGlobalCustomFieldSettings?: () => void;
}

const statusColors = {
  potential: 'bg-gray-500',
  contacted: 'bg-blue-500',
  qualified: 'bg-green-500',
  closed: 'bg-red-500'
};

const statusLabels = {
  potential: 'Potential',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed'
};

export const LeadDetail: React.FC<LeadDetailProps> = ({
  lead,
  onClose,
  onAddActivity,
  onUpdateLead,
  onConvertToDeal,
  allLeads,
  onLeadSelect,
  customFields,
  activityTemplates,
  onDeleteActivity,
  isOpen,
  onAddCustomField,
  onShowGlobalCustomFieldSettings
}) => {
  const { profile } = useProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(lead);
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  // State for the new custom field modal
  const [showAddCustomFieldModal, setShowAddCustomFieldModal] = useState(false);

  // State for custom activity modal
  const [showCustomActivityModal, setShowCustomActivityModal] = useState(false);
  const [selectedActivityTemplate, setSelectedActivityTemplate] = useState<ActivityTemplate | null>(null);
  const [activityResponses, setActivityResponses] = useState<Record<string, string>>({});
  const [newCustomField, setNewCustomField] = useState<{
    name: string;
    field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    options: string[];
  }>({
    name: '',
    field_type: 'text',
    options: []
  });

  const [showActivityForm, setShowActivityForm] = useState(false);
  const [templateFieldValues, setTemplateFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    setEditForm(lead);
    setIsEditing(false);
  }, [lead]);

  const handleToggleEdit = () => {
    if (!isEditing) {
      const initialCustomFields: Record<string, any> = {};
      if (customFields) {
        customFields
          .filter(field => field.entity_type === 'lead')
          .forEach(field => {
            const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
            initialCustomFields[fieldKey] = lead.custom_fields?.[fieldKey] ?? 
              (field.field_type === 'checkbox' ? false : 
               field.field_type === 'select' ? '' : 
               field.field_type === 'number' ? '0' : '');
          });
      }
      setEditForm({ 
        ...lead, 
        custom_fields: { ...initialCustomFields, ...lead.custom_fields }
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    const updates = { 
      ...editForm,
      custom_fields: Object.fromEntries(
        Object.entries(editForm.custom_fields || {}).filter(([_, value]) => value !== null && value !== undefined)
      )
    };
    onUpdateLead(lead.id, updates);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditForm(lead);
    setIsEditing(false);
  };

  const handleAddNote = () => {
    if (newNote.trim() && profile) {
      onAddActivity({
        entity_type: 'lead',
        entity_id: lead.id,
        type: 'note',
        content: newNote,
        author_id: profile.id,
        template_data: {}
      });
      setNewNote('');
    }
  };

  const handleCreateCustomField = async () => {
    if (!onAddCustomField || !newCustomField.name) return;

    try {
      await onAddCustomField({
        name: newCustomField.name,
        field_type: newCustomField.field_type,
        entity_type: 'lead',
        options: newCustomField.field_type === 'select' ? newCustomField.options : undefined,
        sort_order: 0,
        team_id: lead.team_id,
        created_at: new Date().toISOString()
      });

      const fieldKey = newCustomField.name.toLowerCase().replace(/\s+/g, '_');
      setEditForm(prevForm => ({
        ...prevForm,
        custom_fields: {
          ...prevForm.custom_fields,
          [fieldKey]: newCustomField.field_type === 'checkbox' ? false : ''
        }
      }));

      setNewCustomField({ name: '', field_type: 'text', options: [] });
      setShowAddCustomFieldModal(false);
    } catch (error) {
      console.error('Error adding custom field:', error);
    }
  };

  const handleOpenActivityModal = () => {
    setShowCustomActivityModal(true);
  };

  const handleSelectActivityTemplate = (template: ActivityTemplate) => {
    setSelectedActivityTemplate(template);
    setActivityResponses({});
  };

  const handleActivityResponseChange = (questionId: string, value: string) => {
    setActivityResponses(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmitCustomActivity = () => {
    if (!selectedActivityTemplate || !profile) return;

    const templateData = {
      template_id: selectedActivityTemplate.id,
      template_name: selectedActivityTemplate.name,
      questions: selectedActivityTemplate.questions || [],
      responses: activityResponses
    };

    // Create content for the activity
    const content = `${selectedActivityTemplate.name}\n\n${Object.entries(activityResponses)
      .map(([questionId, answer]) => {
        const question = (selectedActivityTemplate.questions || []).find(q => q.id === questionId);
        return `${question?.text || 'Question'}: ${answer}`;
      })
      .join('\n')}`;

    onAddActivity({
      entity_type: 'lead',
      entity_id: lead.id,
      type: 'custom',
      content: content,
      author_id: profile.id,
      template_data: templateData
    });

    // Reset state
    setSelectedActivityTemplate(null);
    setActivityResponses({});
    setShowCustomActivityModal(false);
  };

  const handleSubmitActivity = () => {
    if (!selectedActivityTemplate || !profile) return;

    // Create content for the activity from template field values
    const content = `${selectedActivityTemplate.name}\n\n${Object.entries(templateFieldValues)
      .map(([fieldName, value]) => `${fieldName}: ${value}`)
      .join('\n')}`;

    // Create template data structure
    const templateData = {
      template_id: selectedActivityTemplate.id,
      template_name: selectedActivityTemplate.name,
      fields: selectedActivityTemplate.fields,
      field_values: templateFieldValues
    };

    // Submit the activity
    onAddActivity({
      entity_type: 'lead',
      entity_id: lead.id,
      type: 'custom',
      content: content,
      author_id: profile.id,
      template_data: templateData
    });

    // Reset state and close modal
    setSelectedActivityTemplate(null);
    setTemplateFieldValues({});
    setShowActivityForm(false);
  };

  return (
    <div 
      className={`fixed inset-y-0 right-0 z-40 w-[800px] bg-white shadow-lg flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-semibold text-gray-900">{lead.name}</h1>
          <Badge className={cn(
            "inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white",
            statusColors[lead.status]
          )}>
            {statusLabels[lead.status]}
          </Badge>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={handleToggleEdit}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      {!isEditing && (
        <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              <StickyNote className="w-4 h-4 mr-1" />
              Note
            </Button>
            <Button size="sm" variant="outline" className="border-gray-300">
              <Mail className="w-4 h-4 mr-1" />
              Email
            </Button>
            <Button size="sm" variant="outline" className="border-gray-300">
              <MessageSquare className="w-4 h-4 mr-1" />
              SMS
            </Button>
            <Button size="sm" variant="outline" className="border-gray-300">
              <Phone className="w-4 h-4 mr-1" />
              Call
            </Button>
            <Button size="sm" variant="outline" className="border-gray-300" onClick={() => setShowActivityForm(true)}>
              Activity
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {isEditing ? (
          <div className="flex-1 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Lead</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Name</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Email</Label>
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Phone</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value: 'potential' | 'contacted' | 'qualified' | 'closed') => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="potential">Potential</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Website</Label>
                <Input
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">Address</Label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-sm font-medium text-gray-700">Description</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                />
              </div>

              {/* Custom Fields */}
              {customFields && customFields.filter(field => field.entity_type === 'lead').map(field => {
                const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                if (editForm.custom_fields && editForm.custom_fields.hasOwnProperty(fieldKey)) {
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">{field.name}</Label>
                      {field.field_type === 'text' && (
                        <Input
                          value={(editForm.custom_fields[fieldKey] as string) || ''}
                          onChange={(e) => {
                            const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                            setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                          }}
                        />
                      )}
                      {field.field_type === 'number' && (
                        <Input
                          type="number"
                          value={(editForm.custom_fields[fieldKey] as string) || ''}
                          onChange={(e) => {
                            const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                            setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                          }}
                        />
                      )}
                      {field.field_type === 'select' && (
                        <Select
                          value={(editForm.custom_fields[fieldKey] as string) || ''}
                          onValueChange={(value) => {
                            const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: value };
                            setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${field.name}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((option, index) => (
                              <SelectItem key={index} value={option}>{option}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {field.field_type === 'checkbox' && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={fieldKey}
                            checked={!!editForm.custom_fields[fieldKey]}
                            onCheckedChange={(checked) => {
                              const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: checked };
                              setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                            }}
                          />
                          <Label htmlFor={fieldKey} className="text-sm text-gray-700">{field.name}</Label>
                        </div>
                      )}
                      {field.field_type === 'date' && (
                        <Input
                          type="date"
                          value={(editForm.custom_fields[fieldKey] as string) || ''}
                          onChange={(e) => {
                            const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                            setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                          }}
                        />
                      )}
                    </div>
                  );
                }
                return null;
              })}

              <div className="col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddCustomFieldModal(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Custom Field
                </Button>
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6 pt-4 border-t">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              <Button onClick={handleSave}>Save</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Left Sidebar - ABOUT Section */}
            <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">ABOUT</h2>

                  <div className="space-y-3">
                    {lead.email && (
                      <div className="flex items-center text-sm">
                        <Mail className="w-4 h-4 mr-3 text-gray-400" />
                        <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">
                          {lead.email}
                        </a>
                      </div>
                    )}

                    {lead.phone && (
                      <div className="flex items-center text-sm">
                        <Phone className="w-4 h-4 mr-3 text-gray-400" />
                        <a href={`tel:${lead.phone}`} className="text-gray-900 hover:underline">
                          {lead.phone}
                        </a>
                      </div>
                    )}

                    {lead.website && (
                      <div className="flex items-center text-sm">
                        <Globe className="w-4 h-4 mr-3 text-gray-400" />
                        <a 
                          href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {lead.website}
                        </a>
                      </div>
                    )}

                    {lead.address && (
                      <div className="flex items-center text-sm">
                        <MapPin className="w-4 h-4 mr-3 text-gray-400" />
                        <span className="text-gray-900">{lead.address}</span>
                      </div>
                    )}

                    {lead.description && (
                      <div className="flex items-start text-sm">
                        <FileText className="w-4 h-4 mr-3 text-gray-400 mt-0.5" />
                        <p className="text-gray-900">{lead.description}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Custom Fields Section */}
                {customFields && customFields.filter(field => field.entity_type === 'lead').length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">CUSTOM FIELDS</h3>
                    <div className="space-y-3">
                      {customFields.filter(field => field.entity_type === 'lead').map(field => {
                        const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                        const fieldValue = lead.custom_fields?.[fieldKey];

                        if (fieldValue === undefined || fieldValue === null || fieldValue === '') return null;

                        return (
                          <div key={field.id} className="text-sm">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
                              {field.name}
                            </div>
                            <div className="text-gray-900">
                              {field.field_type === 'checkbox' ? (fieldValue ? 'Yes' : 'No') : 
                               field.field_type === 'date' ? new Date(fieldValue as string).toLocaleDateString() : 
                               String(fieldValue)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Convert to Deal Button */}
                <Button 
                  onClick={() => onConvertToDeal(lead)} 
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Convert to Deal
                </Button>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="border-b border-gray-200 bg-white">
                <div className="px-6">
                  <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="h-12 bg-transparent border-none p-0">
                      <TabsTrigger 
                        value="all" 
                        className="h-12 px-4 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent rounded-none"
                      >
                        All
                      </TabsTrigger>
                      <TabsTrigger 
                        value="important" 
                        className="h-12 px-4 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent rounded-none"
                      >
                        Important
                      </TabsTrigger>
                      <TabsTrigger 
                        value="notes" 
                        className="h-12 px-4 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent rounded-none"
                      >
                        Notes & Summaries
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Add Note Section */}
                <div className="mb-6">
                  <div className="flex space-x-3">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note, log a call, etc..."
                      className="flex-1 min-h-[100px] resize-none border-gray-300"
                    />
                    <Button 
                      onClick={handleAddNote} 
                      disabled={!newNote.trim()}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Activities List */}
                <div className="space-y-4">
                  {lead.activities && lead.activities.length > 0 ? (
                    lead.activities.map((activity) => (
                      <div key={activity.id} className="border border-gray-200 rounded-lg p-4 bg-white">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                                {activity.type === 'custom' ? (
                                  <Briefcase className="w-4 h-4 text-gray-600" />
                                ) : (
                                  <StickyNote className="w-4 h-4 text-gray-600" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {activity.type === 'custom' && activity.template_data?.template_name 
                                    ? activity.template_data.template_name 
                                    : activity.type.charAt(0).toUpperCase() + activity.type.slice(1).replace('_', ' ')
                                  }
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(activity.created_at).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="ml-10">
                              {activity.type === 'custom' && activity.template_data?.responses ? (
                                <div className="space-y-3">
                                  {Object.entries(activity.template_data.responses).map(([questionId, answer]) => {
                                    const question = activity.template_data?.questions?.find((q: any) => q.id === questionId);
                                    return (
                                      <div key={questionId} className="text-sm">
                                        <div className="font-bold text-gray-900 mb-1">
                                          {question?.text || 'Question'}
                                        </div>
                                        <div className="text-gray-700 pl-2">
                                          {String(answer)}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-800">{activity.content}</p>
                              )}
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => onDeleteActivity(activity.id, 'lead', lead.id)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <StickyNote className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p>No activities yet. Add your first note above.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Custom Field Modal */}
      <Dialog open={showAddCustomFieldModal} onOpenChange={setShowAddCustomFieldModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
            <DialogDescription>
              Create a new custom field for this lead.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newFieldName">Field Name</Label>
              <Input
                id="newFieldName"
                value={newCustomField.name}
                onChange={(e) => setNewCustomField({...newCustomField, name: e.target.value})}
                placeholder="e.g. Budget"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newFieldType">Field Type</Label>
              <Select
                value={newCustomField.field_type}
                onValueChange={(value: 'text' | 'number' | 'date' | 'select' | 'checkbox') => 
                  setNewCustomField({...newCustomField, field_type: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
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
            {newCustomField.field_type === 'select' && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="space-y-2">
                  {newCustomField.options.map((option, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={option}
                        onChange={(e) => {
                          const newOptions = [...newCustomField.options];
                          newOptions[index] = e.target.value;
                          setNewCustomField({...newCustomField, options: newOptions});
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          const newOptions = newCustomField.options.filter((_, i) => i !== index);
                          setNewCustomField({...newCustomField, options: newOptions});
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setNewCustomField({
                      ...newCustomField,
                      options: [...newCustomField.options, '']
                    })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddCustomFieldModal(false);
              setNewCustomField({ name: '', field_type: 'text', options: [] });
            }}>
              Cancel
            </Button>
            <Button onClick={handleCreateCustomField} disabled={!newCustomField.name || (newCustomField.field_type === 'select' && newCustomField.options.length === 0)}>
              Create Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Activity Modal */}
      <Dialog open={showCustomActivityModal} onOpenChange={setShowCustomActivityModal}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Custom Activity</DialogTitle>
            <DialogDescription>
              Select an activity template and fill in the details.
            </DialogDescription>
          </DialogHeader>

          {!selectedActivityTemplate ? (
            // Template Selection
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Select Activity Template</h3>
              <div className="grid gap-3">
                {activityTemplates && activityTemplates.length > 0 ? (
                  activityTemplates.map((template) => (
                    <Card 
                      key={template.id} 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleSelectActivityTemplate(template)}
                    >
                      <CardContent className="p-4">
                        <h4 className="font-medium text-gray-900">{template.name}</h4>
                        {template.description && (
                          <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                          {template.questions?.length || 0} questions
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Briefcase className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No activity templates available.</p>
                    <p className="text-sm">Create templates in the Settings section.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Template Form
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">{selectedActivityTemplate.name}</h3>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedActivityTemplate(null)}
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  Back
                </Button>
              </div>

              {selectedActivityTemplate.description && (
                <p className="text-gray-600">{selectedActivityTemplate.description}</p>
              )}

              <div className="space-y-4">
                {selectedActivityTemplate.questions && selectedActivityTemplate.questions.map((question) => (
                  <div key={question.id} className="space-y-2">
                    <Label className="text-sm font-medium">
                      {question.text}
                      {question.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>

                    {question.type === 'text' && (
                      <Input
                        value={activityResponses[question.id] || ''}
                        onChange={(e) => handleActivityResponseChange(question.id, e.target.value)}
                        placeholder={question.placeholder || 'Enter your answer...'}
                      />
                    )}

                    {question.type === 'textarea' && (
                      <Textarea
                        value={activityResponses[question.id] || ''}
                        onChange={(e) => handleActivityResponseChange(question.id, e.target.value)}
                        placeholder={question.placeholder || 'Enter your answer...'}
                        rows={3}
                      />
                    )}

                    {question.type === 'select' && (
                      <Select
                        value={activityResponses[question.id] || ''}
                        onValueChange={(value) => handleActivityResponseChange(question.id, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={question.placeholder || 'Select an option...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {question.options?.map((option, index) => (
                            <SelectItem key={index} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {question.type === 'number' && (
                      <Input
                        type="number"
                        value={activityResponses[question.id] || ''}
                        onChange={(e) => handleActivityResponseChange(question.id, e.target.value)}
                        placeholder={question.placeholder || 'Enter a number...'}
                      />
                    )}

                    {question.type === 'date' && (
                      <Input
                        type="date"
                        value={activityResponses[question.id] || ''}
                        onChange={(e) => handleActivityResponseChange(question.id, e.target.value)}
                      />
                    )}

                    {question.type === 'checkbox' && (
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id={question.id}
                          checked={activityResponses[question.id] === 'true'}
                          onCheckedChange={(checked) => 
                            handleActivityResponseChange(question.id, checked ? 'true' : 'false')
                          }
                        />
                        <Label htmlFor={question.id} className="text-sm">
                          {question.placeholder || 'Check if applicable'}
                        </Label>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCustomActivityModal(false);
              setSelectedActivityTemplate(null);
              setActivityResponses({});
            }}>
              Cancel
            </Button>
            {selectedActivityTemplate && (
              <Button 
                onClick={handleSubmitCustomActivity}
                disabled={
                  !selectedActivityTemplate.questions ||
                  selectedActivityTemplate.questions.some(q => 
                    q.required && !activityResponses[q.id]
                  )
                }
              >
                Submit Activity
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      
{showActivityForm && (
          <Dialog open={true} onOpenChange={() => setShowActivityForm(false)}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Custom Activity</DialogTitle>
                <DialogDescription>
                  Select an activity template and fill in the details.
                </DialogDescription>
              </DialogHeader>

              {!selectedActivityTemplate ? (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="template-select">Select Template</Label>
                    <Select onValueChange={(value) => {
                      const template = activityTemplates?.find(t => t.id === value);
                      console.log('Selected template:', template);
                      setSelectedActivityTemplate(template || null);
                      if (template) {
                        // Initialize template field values
                        const initialValues: Record<string, string> = {};
                        if (template.fields && Array.isArray(template.fields)) {
                          template.fields.forEach(field => {
                            initialValues[field.name] = '';
                          });
                        }
                        console.log('Initial field values:', initialValues);
                        setTemplateFieldValues(initialValues);
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an activity template" />
                      </SelectTrigger>
                      <SelectContent>
                        {activityTemplates?.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">{selectedActivityTemplate?.name}</h3>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setSelectedActivityTemplate(null);
                        setTemplateFieldValues({});
                      }}
                    >
                      ← Back
                    </Button>
                  </div>

                  {console.log('Template fields:', selectedActivityTemplate.fields)}
                  {selectedActivityTemplate?.fields && Array.isArray(selectedActivityTemplate.fields) && selectedActivityTemplate.fields.length > 0 ? (
                    selectedActivityTemplate.fields.map((field, index) => (
                      <div key={`${field.name}-${index}`} className="space-y-2">
                        <Label htmlFor={field.name}>{field.name}</Label>
                        {field.type === 'text' && (
                          <Input
                            id={field.name}
                            value={templateFieldValues[field.name] || ''}
                            onChange={(e) => setTemplateFieldValues(prev => ({
                              ...prev,
                              [field.name]: e.target.value
                            }))}
                            placeholder={`Enter ${field.name}`}
                          />
                        )}
                        {field.type === 'textarea' && (
                          <Textarea
                            id={field.name}
                            value={templateFieldValues[field.name] || ''}
                            onChange={(e) => setTemplateFieldValues(prev => ({
                              ...prev,
                              [field.name]: e.target.value
                            }))}
                            placeholder={`Enter ${field.name}`}
                            rows={3}
                          />
                        )}
                        {field.type === 'select' && field.options && Array.isArray(field.options) && (
                          <Select
                            value={templateFieldValues[field.name] || ''}
                            onValueChange={(value) => setTemplateFieldValues(prev => ({
                              ...prev,
                              [field.name]: value
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`Select ${field.name}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {field.options.map((option, optIndex) => (
                                <SelectItem key={`${option}-${optIndex}`} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No fields configured for this template.</p>
                      <p className="text-sm mt-2">Go to Settings → Activity Templates to add fields.</p>
                      {selectedActivityTemplate && (
                        <div className="mt-4 p-3 bg-gray-100 rounded text-left">
                          <p className="text-xs"><strong>Debug Info:</strong></p>
                          <p className="text-xs">Template ID: {selectedActivityTemplate.id}</p>
                          <p className="text-xs">Template Name: {selectedActivityTemplate.name}</p>
                          <p className="text-xs">Fields: {JSON.stringify(selectedActivityTemplate.fields)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowActivityForm(false)}>
                  Cancel
                </Button>
                {selectedActivityTemplate && (
                  <Button onClick={handleSubmitActivity}>
                    Submit Activity
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
    </div>
  );
};