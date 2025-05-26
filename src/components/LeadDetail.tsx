import React, { useState, useEffect } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useProfile } from '@/hooks/useProfile';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
  const [selectedActivityTemplate, setSelectedActivityTemplate] = useState<string | null>(null);
  const [activityFormData, setActivityFormData] = useState<Record<string, any>>({});

  // State for the new custom field modal
  const [showAddCustomFieldModal, setShowAddCustomFieldModal] = useState(false);
  const [newCustomField, setNewCustomField] = useState<{
    name: string;
    field_type: 'text' | 'number' | 'date' | 'select' | 'checkbox';
    options: string[];
  }>({
    name: '',
    field_type: 'text',
    options: []
  });

  useEffect(() => {
    // When the lead changes, reset the edit form state
    setEditForm(lead);
    // Also reset edit mode when lead changes
    setIsEditing(false);
  }, [lead]);

  const currentIndex = allLeads.findIndex(l => l.id === lead.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allLeads.length - 1;

  const navigateTo = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && hasPrevious) {
      onLeadSelect(allLeads[currentIndex - 1]);
    } else if (direction === 'next' && hasNext) {
      onLeadSelect(allLeads[currentIndex + 1]);
    }
  };

  // Function to handle toggling edit mode
  const handleToggleEdit = () => {
    if (!isEditing) {
      // When entering edit mode, initialize editForm with current lead data
      // and ensure custom_fields are included, initialized if missing
      const initialCustomFields: Record<string, any> = {};
      if (customFields) {
        customFields
          .filter(field => field.entity_type === 'lead')
          .forEach(field => {
            const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
            // Use existing value from lead if available, otherwise use a default (empty string or false)
            initialCustomFields[fieldKey] = lead.custom_fields?.[fieldKey] ?? 
              (field.field_type === 'checkbox' ? false : 
               field.field_type === 'select' ? '' : 
               field.field_type === 'number' ? '0' : '');
          });
      }
      console.log('Initializing edit form with custom fields:', initialCustomFields);
      // Merge with existing standard fields, ensuring custom_fields is the initialized object
      setEditForm({ 
        ...lead, 
        custom_fields: { ...initialCustomFields, ...lead.custom_fields }
      });
    }
    // When exiting edit mode (via Cancel or Save), the useEffect for lead change will reset the form if needed
    setIsEditing(!isEditing);
  };

  const handleSave = () => {
    // Ensure custom_fields object is not undefined when saving
    const updates = { 
      ...editForm,
      custom_fields: Object.fromEntries(
        Object.entries(editForm.custom_fields || {}).filter(([_, value]) => value !== null && value !== undefined)
      )
    };
    console.log('Saving lead updates:', updates);
    console.log('Current editForm:', editForm);
    console.log('Custom fields before save:', editForm.custom_fields);
    
    onUpdateLead(lead.id, updates);
    console.log('onUpdateLead called with:', lead.id, updates);
    setIsEditing(false);
  };

  const handleCancel = () => {
    console.log('Canceling edit, reverting to:', lead);
    setEditForm(lead); // Revert to the original lead data
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
  
  const handleAddCustomActivity = () => {
    if (!selectedActivityTemplate || !profile) return;
    
    const template = activityTemplates?.find(t => t.id === selectedActivityTemplate);
    if (!template) return;
    
    onAddActivity({
      entity_type: 'lead',
      entity_id: lead.id,
      type: 'custom',
      content: `${template.name} für ${lead.name}`,
      author_id: profile.id,
      template_data: activityFormData,
      template_id: selectedActivityTemplate,
    });
    
    setSelectedActivityTemplate(null);
    setActivityFormData({});
    setActiveTab('all');
  };
  
  const formatUrlAsLink = (url: string) => {
    if (!url) return '';
    
    const hasProtocol = url.startsWith('http://') || url.startsWith('https://');
    const formattedUrl = hasProtocol ? url : `https://${url}`;
    
    return (
      <a 
        href={formattedUrl} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline"
      >
        {url}
      </a>
    );
  };

  const handleCreateCustomField = async () => {
    if (!onAddCustomField || !newCustomField.name) return; // Check if onAddCustomField prop is available

    try {
      // Call the parent function to add the custom field to the database
      await onAddCustomField({
        name: newCustomField.name,
        field_type: newCustomField.field_type,
        entity_type: 'lead', // This modal is specifically for lead custom fields
        options: newCustomField.field_type === 'select' ? newCustomField.options : undefined,
        sort_order: 0, // Default sort order, might need adjustment in parent component
        team_id: lead.team_id, // Add team_id from the current lead
        created_at: new Date().toISOString() // Add current timestamp
      });

      // Add the newly created field to the current editForm state immediately
      const fieldKey = newCustomField.name.toLowerCase().replace(/\s+/g, '_');
      setEditForm(prevForm => ({
        ...prevForm,
        custom_fields: {
          ...prevForm.custom_fields,
          [fieldKey]: newCustomField.field_type === 'checkbox' ? false : '' // Initialize with default value
        }
      }));

      // Reset the new custom field form and close the modal
      setNewCustomField({ name: '', field_type: 'text', options: [] });
      setShowAddCustomFieldModal(false);

    } catch (error) {
      console.error('Error adding custom field from Lead Detail:', error);
      // Optionally show a toast notification for the error
    }
  };

  // Add useEffect to monitor editForm changes
  useEffect(() => {
    console.log('editForm changed:', editForm);
  }, [editForm]);

  // Add useEffect to monitor custom fields changes
  useEffect(() => {
    if (customFields) {
      console.log('Available custom fields:', customFields);
    }
  }, [customFields]);

  return (
    <div 
      className={`fixed inset-y-0 right-0 z-40 w-full md:w-1/2 bg-white shadow-lg flex flex-col overflow-hidden transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold text-gray-900">{lead.name}</h2>
          <Badge className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white",
            lead.status === 'potential' ? 'bg-gray-500' :
            lead.status === 'contacted' ? 'bg-blue-500' :
            lead.status === 'qualified' ? 'bg-green-500' :
            lead.status === 'closed' ? 'bg-red-500' : 'bg-gray-500'
          )}>
            {lead.status === 'potential' ? 'Potential' :
             lead.status === 'contacted' ? 'Contacted' :
             lead.status === 'qualified' ? 'Qualified' :
             lead.status === 'closed' ? 'Closed' : lead.status}
          </Badge>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={handleToggleEdit}>
            <Edit2 className="w-4 h-4" />
          </Button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {!isEditing && (
        <div className="px-6 py-3 border-b border-gray-200 flex items-center space-x-2 flex-shrink-0">
          <Button size="sm" className="flex items-center space-x-1">
            <StickyNote className="w-4 h-4" />
            <span>Note</span>
          </Button>
          <Button size="sm" variant="outline" className="flex items-center space-x-1">
            <Mail className="w-4 h-4" />
            <span>Email</span>
          </Button>
          <Button size="sm" variant="outline" className="flex items-center space-x-1">
            <Phone className="w-4 h-4" />
            <span>Call</span>
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto flex">
        {isEditing ? (
          <div className="p-6 space-y-6 w-full">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Lead bearbeiten</h4>
            {/* Using a grid for better layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Standardfelder */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Telefon</label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={editForm.status}
                  onValueChange={(value: 'potential' | 'contacted' | 'qualified' | 'closed') => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Status auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="potential">Potential</SelectItem>
                    <SelectItem value="contacted">Contacted</SelectItem>
                    <SelectItem value="qualified">Qualified</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Benutzerdefinierte Felder */}
              {customFields && customFields.filter(field => field.entity_type === 'lead').map(field => {
                const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                // Render only if the field is in the editForm state (newly added fields will be)
                // or if it had a value in the original lead data
                if (editForm.custom_fields && editForm.custom_fields.hasOwnProperty(fieldKey)) {
                   return (
                     <div key={field.id} className="space-y-2">
                       <label className="text-sm font-medium">{field.name}</label>
                       {field.field_type === 'text' && (
                         <Input
                           value={(editForm.custom_fields[fieldKey] as string) || ''}
                           onChange={(e) => {
                             const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                             setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                           }}
                           className="mt-1"
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
                           className="mt-1"
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
                           <SelectTrigger className="mt-1">
                             <SelectValue placeholder={`${field.name} auswählen`} />
                           </SelectTrigger>
                           <SelectContent>
                             {field.options.map((option, index) => (
                               <SelectItem key={index} value={option}>{option}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                       )}
                       {field.field_type === 'checkbox' && (
                          <div className="flex items-center space-x-2 mt-1">
                            <Checkbox
                              id={fieldKey}
                              checked={!!editForm.custom_fields[fieldKey]}
                              onCheckedChange={(checked) => {
                                const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: checked };
                                setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                              }}
                            />
                            <label htmlFor={fieldKey} className="text-sm text-gray-700">{field.name}</label>
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
                            className="mt-1"
                          />
                       )}
                     </div>
                   );
                }
                return null; // Don't render if the field isn't in editForm (shouldn't happen with new init logic)
              })}

              {/* Button to add new custom field */}
              <div className="col-span-1 md:col-span-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddCustomFieldModal(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Neues benutzerdefiniertes Feld hinzufügen
                </Button>
              </div>

            </div>
            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="outline" onClick={handleCancel}>Abbrechen</Button>
              <Button onClick={handleSave}>Speichern</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="w-1/3 border-r border-gray-200 p-6 space-y-6 flex-shrink-0 sticky top-0 h-full overflow-y-auto">
              <Accordion type="single" collapsible defaultValue="about-section">
                <AccordionItem value="about-section">
                  <AccordionTrigger className="text-sm font-medium text-gray-900 py-2 flex justify-between items-center w-full">
                    ABOUT
                  </AccordionTrigger>
                  <AccordionContent className="pt-2">
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center text-sm text-gray-600">
                        <Mail className="w-4 h-4 mr-2" />
                        <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a>
                      </div>
                      <div className="flex items-center text-sm text-gray-600">
                        <Phone className="w-4 h-4 mr-2" />
                        <a href={`tel:${lead.phone}`} className="hover:underline">{lead.phone}</a>
                      </div>
                      {lead.website && (
                        <div className="flex items-center text-sm text-gray-600">
                          <Globe className="w-4 h-4 mr-2" />
                          <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {lead.website}
                          </a>
                        </div>
                      )}
                      {lead.address && (
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mr-2" />
                          <span>{lead.address}</span>
                        </div>
                      )}
                      {lead.description && (
                        <div className="flex items-center text-sm text-gray-600">
                          <StickyNote className="w-4 h-4 mr-2" />
                          <p>{lead.description}</p>
                        </div>
                      )}
                      
                      {lead.custom_fields?.review_count && (
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="font-medium mr-2">Review Count:</span>
                          <span>{lead.custom_fields.review_count as string}</span>
                        </div>
                      )}
                      {lead.custom_fields?.gmb_url && (
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="font-medium mr-2">GMB URL:</span>
                          <a href={lead.custom_fields.gmb_url as string} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {lead.custom_fields.gmb_url as string}
                          </a>
                        </div>
                      )}

                      {/* Benutzerdefinierte Felder innerhalb von ABOUT */}
                      {customFields && customFields.filter(field => field.entity_type === 'lead').map(field => {
                        const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                        const fieldValue = lead.custom_fields?.[fieldKey];
                        
                        if (fieldValue === undefined || fieldValue === null || fieldValue === '') return null; // Don't display if value is empty

                        return (
                          <div key={field.id} className="flex items-center text-sm text-gray-600">
                            {/* Display icon based on field type? Or a generic one? Let's use a generic one for now */}
                            {/* <FileText className="w-4 h-4 mr-2" /> */}
                            <span className="font-medium mr-2">{field.name}:</span>
                            <span>
                              {field.field_type === 'checkbox' ? (fieldValue ? 'Yes' : 'No') : 
                               field.field_type === 'select' ? String(fieldValue).split(',').map((item, index) => (
                                 <Badge key={index} variant="secondary" className="mr-1 mb-1">{item.trim()}</Badge>
                               )) : 
                               field.field_type === 'date' ? new Date(fieldValue as string).toLocaleDateString() : 
                               field.field_type === 'number' ? fieldValue as string : 
                               String(fieldValue) // Default to string for text and others
                              }
                            </span>
                          </div>
                        );
                      })}

                      {/* Convert to Deal Button */}
                      <Button onClick={() => onConvertToDeal(lead)} className="mt-4 w-full">
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Convert to Deal
                      </Button>

                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <div className="flex-1 p-6 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Add Activity</h4>
                <div className="flex space-x-2">
                  <Textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Add a note, log a call, etc..."
                    className="flex-1 text-sm resize-none"
                    rows={3}
                  />
                  <Button onClick={handleAddNote} disabled={!newNote.trim()} size="sm">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-3">Activities</h4>
                <div className="space-y-4">
                  {lead.activities && lead.activities.length > 0 ? (
                    lead.activities.map((activity) => (
                      <div key={activity.id} className="border rounded-md p-3 bg-gray-50">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                          <span>{activity.type}</span>
                          <span>{new Date(activity.created_at).toLocaleString()}</span>
                        </div>
                        <p className="text-sm text-gray-800">{activity.content}</p>
                        <div className="flex justify-end mt-2">
                          <Button variant="ghost" size="sm" onClick={() => onDeleteActivity(activity.id, 'lead', lead.id)}>
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-gray-500">No activities yet.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal to add new custom field */}
      <Dialog open={showAddCustomFieldModal} onOpenChange={setShowAddCustomFieldModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Neues benutzerdefiniertes Feld</DialogTitle>
            <DialogDescription>
              Erstellen Sie ein neues benutzerdefiniertes Feld für diesen Lead.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newFieldName">Feldname</Label>
              <Input
                id="newFieldName"
                value={newCustomField.name}
                onChange={(e) => setNewCustomField({...newCustomField, name: e.target.value})}
                placeholder="z.B. Budget"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newFieldType">Feldtyp</Label>
              <Select
                value={newCustomField.field_type}
                onValueChange={(value: 'text' | 'number' | 'date' | 'select' | 'checkbox') => 
                  setNewCustomField({...newCustomField, field_type: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Typ auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Zahl</SelectItem>
                  <SelectItem value="date">Datum</SelectItem>
                  <SelectItem value="select">Auswahl</SelectItem>
                  <SelectItem value="checkbox">Checkbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newCustomField.field_type === 'select' && (
              <div className="space-y-2">
                <Label>Optionen</Label>
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
                    Option hinzufügen
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
              Abbrechen
            </Button>
            <Button onClick={handleCreateCustomField} disabled={!newCustomField.name || (newCustomField.field_type === 'select' && newCustomField.options.length === 0)}>
              Feld erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
