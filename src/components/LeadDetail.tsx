Updating the drag and drop functionality for field items in SalesPipelineSettings.tsx.
```

```tsx
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
  Briefcase,
  ArrowUpDown
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

  // Field layout customization states
  const [showFieldLayoutModal, setShowFieldLayoutModal] = useState(false);
  const [fieldGroups, setFieldGroups] = useState([
    {
      id: 'about',
      name: 'ABOUT',
      fields: ['email', 'phone', 'website', 'address', 'description'],
      order: 0
    },
    {
      id: 'custom_fields',
      name: 'CUSTOM FIELDS',
      fields: [], // Will be populated with custom field keys
      order: 1
    }
  ]);
  const [newGroupName, setNewGroupName] = useState('');
  const [draggedField, setDraggedField] = useState<string | null>(null);

  useEffect(() => {
    setEditForm(lead);
    setIsEditing(false);

    // Update custom fields group with actual custom field keys
    if (customFields) {
      const customFieldKeys = customFields
        .filter(field => field.entity_type === 'lead')
        .map(field => field.name.toLowerCase().replace(/\s+/g, '_'));

      setFieldGroups(prev => prev.map(group => 
        group.id === 'custom_fields' 
          ? { ...group, fields: customFieldKeys }
          : group
      ));
    }
  }, [lead, customFields]);

  // Field layout management functions
  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;

    const newGroup = {
      id: `group_${Date.now()}`,
      name: newGroupName.trim().toUpperCase(),
      fields: [],
      order: fieldGroups.length
    };

    setFieldGroups([...fieldGroups, newGroup]);
    setNewGroupName('');
  };

  const handleDeleteGroup = (groupId: string) => {
    if (groupId === 'about' || groupId === 'custom_fields') return; // Prevent deletion of default groups

    const groupToDelete = fieldGroups.find(g => g.id === groupId);
    if (!groupToDelete) return;

    // Move fields from deleted group to "about" group
    setFieldGroups(prev => {
      const filtered = prev.filter(g => g.id !== groupId);
      return filtered.map(g => 
        g.id === 'about' 
          ? { ...g, fields: [...g.fields, ...groupToDelete.fields] }
          : g
      );
    });
  };

  const handleMoveField = (fieldKey: string, fromGroupId: string, toGroupId: string) => {
    setFieldGroups(prev => prev.map(group => {
      if (group.id === fromGroupId) {
        return { ...group, fields: group.fields.filter(f => f !== fieldKey) };
      }
      if (group.id === toGroupId) {
        return { ...group, fields: [...group.fields, fieldKey] };
      }
      return group;
    }));
  };

  const handleReorderGroups = (startIndex: number, endIndex: number) => {
    const result = Array.from(fieldGroups);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    setFieldGroups(result.map((group, index) => ({ ...group, order: index })));
  };

  const getFieldDisplayName = (fieldKey: string) => {
    if (fieldKey === 'email') return 'Email';
    if (fieldKey === 'phone') return 'Phone';
    if (fieldKey === 'website') return 'Website';
    if (fieldKey === 'address') return 'Address';
    if (fieldKey === 'description') return 'Description';

    const customField = customFields?.find(cf => 
      cf.name.toLowerCase().replace(/\s+/g, '_') === fieldKey
    );
    return customField?.name || fieldKey;
  };

  const getFieldValue = (fieldKey: string) => {
    if (fieldKey === 'email') return lead.email;
    if (fieldKey === 'phone') return lead.phone;
    if (fieldKey === 'website') return lead.website;
    if (fieldKey === 'address') return lead.address;
    if (fieldKey === 'description') return lead.description;

    return lead.custom_fields?.[fieldKey];
  };

  const renderFieldContent = (fieldKey: string) => {
    const value = getFieldValue(fieldKey);
    if (!value) return null;

    if (fieldKey === 'email') {
      return (
        <div className="flex items-center text-sm">
          <Mail className="w-4 h-4 mr-3 text-gray-400" />
          <a href={`mailto:${value}`} className="text-blue-600 hover:underline">
            {value}
          </a>
        </div>
      );
    }

    if (fieldKey === 'phone') {
      return (
        <div className="flex items-center text-sm">
          <Phone className="w-4 h-4 mr-3 text-gray-400" />
          <a href={`tel:${value}`} className="text-gray-900 hover:underline">
            {value}
          </a>
        </div>
      );
    }

    if (fieldKey === 'website') {
      return (
        <div className="flex items-center text-sm">
          <Globe className="w-4 h-4 mr-3 text-gray-400" />
          <a 
            href={value.startsWith('http') ? value : `https://${value}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {value}
          </a>
        </div>
      );
    }

    if (fieldKey === 'address') {
      return (
        <div className="flex items-center text-sm">
          <MapPin className="w-4 h-4 mr-3 text-gray-400" />
          <span className="text-gray-900">{value}</span>
        </div>
      );
    }

    if (fieldKey === 'description') {
      return (
        <div className="flex items-start text-sm">
          <FileText className="w-4 h-4 mr-3 text-gray-400 mt-0.5" />
          <p className="text-gray-900">{value}</p>
        </div>
      );
    }

    // Custom field
    const customField = customFields?.find(cf => 
      cf.name.toLowerCase().replace(/\s+/g, '_') === fieldKey
    );

    if (customField) {
      return (
        <div className="text-sm">
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            {customField.name}
          </div>
          <div className="text-gray-900">
            {customField.field_type === 'checkbox' ? (value ? 'Yes' : 'No') : 
             customField.field_type === 'date' ? new Date(value as string).toLocaleDateString() : 
             String(value)}
          </div>
        </div>
      );
    }

    return null;
  };

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

    // Create markdown formatted content
    const content = `**${selectedActivityTemplate.name}**\n\n${Object.entries(templateFieldValues)
      .map(([fieldName, value]) => `**${fieldName}:**\n${value}`)
      .join('\n\n')}`;

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

  // Drag and Drop Functionality
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, fieldKey: string) => {
    setDraggedField(fieldKey);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedField(null);
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
            {/* Left Sidebar - Dynamic Field Groups */}
            <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
              <div className="p-6">
                {fieldGroups
                  .sort((a, b) => a.order - b.order)
                  .map((group) => {
                    const hasVisibleFields = group.fields.some(fieldKey => {
                      const value = getFieldValue(fieldKey);
                      return value !== undefined && value !== null && value !== '';
                    });

                    if (!hasVisibleFields) return null;

                    return (
                      <div key={group.id} className="mb-6">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                            {group.name}
                          </h2>
                          {group.id === 'about' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowFieldLayoutModal(true)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 h-auto"
                            >
                              Anpassen
                            </Button>
                          )}
                        </div>

                        <div className="space-y-3">
                          {group.fields.map((fieldKey, fieldIndex) => (
                            <div
                              key={`${group.id}-${fieldKey}`}
                              className={cn(
                                "flex items-center justify-between p-2 bg-gray-50 rounded border cursor-move transition-colors",
                                draggedField === fieldKey ? "opacity-50" : "hover:bg-gray-100"
                              )}
                              draggable
                              onDragStart={(e) => handleDragStart(e, fieldKey)}
                              onDragEnd={handleDragEnd}
                            >
                              <span className="text-sm font-medium">
                                {getFieldDisplayName(fieldKey)}
                              </span>
                              <div className="flex items-center space-x-1">
                                <Select
                                  value={group.id}
                                  onValueChange={(newGroupId) => {
                                    if (newGroupId !== group.id) {
                                      handleMoveField(fieldKey, group.id, newGroupId);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-32 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fieldGroups.map((g) => (
                                      <SelectItem key={g.id} value={g.id}>
                                        {g.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

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
                              {activity.type === 'custom' && activity.template_data?.field_values ? (
                                <div className="prose prose-sm max-w-none">
                                  <div className="text-sm text-gray-800 space-y-2">
                                    {Object.entries(activity.template_data.field_values).map(([fieldName, value]) => (
                                      <div key={fieldName} className="border-l-2 border-gray