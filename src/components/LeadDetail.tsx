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
  Trash2
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface LeadDetailProps {
  lead: Lead;
  onClose: () => void;
  onAddActivity: (activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => void;
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  onConvertToDeal: () => void;
  allLeads: Lead[];
  onLeadSelect: (lead: Lead) => void;
  customFields?: CustomField[];
  activityTemplates?: ActivityTemplate[];
  onDeleteActivity: (activityId: string, entityType: string, entityId: string) => void;
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
  onDeleteActivity
}) => {
  const { profile } = useProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(lead);
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedActivityTemplate, setSelectedActivityTemplate] = useState<string | null>(null);
  const [activityFormData, setActivityFormData] = useState<Record<string, any>>({});
  
  useEffect(() => {
    setEditForm(lead);
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

  const handleSave = () => {
    onUpdateLead(lead.id, editForm);
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

  return (
    <div className="w-3/5 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg transition-all duration-300 ease-in-out" style={{ minWidth: '600px' }}>
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">{lead.name}</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => navigateTo('prev')}
              disabled={!hasPrevious}
              className={cn(
                "p-1 rounded hover:bg-gray-100",
                !hasPrevious && "opacity-50 cursor-not-allowed"
              )}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => navigateTo('next')}
              disabled={!hasNext}
              className={cn(
                "p-1 rounded hover:bg-gray-100",
                !hasNext && "opacity-50 cursor-not-allowed"
              )}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2 mb-3">
          <Popover>
            <PopoverTrigger asChild>
              <button className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white cursor-pointer",
                statusColors[lead.status]
              )}>
                {statusLabels[lead.status]}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2">
              <div className="space-y-1">
                <h4 className="text-sm font-medium mb-2">Status ändern</h4>
                {Object.entries(statusLabels).map(([status, label]) => (
                  <button
                    key={status}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm rounded flex items-center",
                      lead.status === status ? "bg-gray-100" : "hover:bg-gray-50"
                    )}
                    onClick={() => {
                      onUpdateLead(lead.id, { status: status as any });
                    }}
                  >
                    <span className={cn(
                      "w-2 h-2 rounded-full mr-2",
                      statusColors[status as keyof typeof statusColors]
                    )} />
                    {label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center space-x-2">
          <button 
            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            onClick={() => {
              setActiveTab('notes');
              setSelectedActivityTemplate(null);
            }}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            <span>Note</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
            <Mail className="w-4 h-4" />
            <span>Email</span>
          </button>
          <button className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
            <Phone className="w-4 h-4" />
            <span>Call</span>
          </button>
          
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex items-center space-x-2 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50">
                <Plus className="w-4 h-4 mr-2" />
                <span>Mehr</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Aktivität hinzufügen</h4>
                {activityTemplates?.map(template => (
                  <button
                    key={template.id}
                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-100 rounded"
                    onClick={() => {
                      setSelectedActivityTemplate(template.id);
                      setActiveTab('custom-activity');
                      const initialData: Record<string, any> = {};
                      template.fields.forEach(field => {
                        initialData[field.name] = '';
                      });
                      setActivityFormData(initialData);
                      console.log('Selected template ID:', template.id);
                      console.log('Activity Templates:', activityTemplates);
                    }}
                  >
                    {template.name}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex">
        <div className="w-2/5 border-r border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-900">ABOUT</h4>
              <Dialog>
                <DialogTrigger asChild>
                  <button className="text-gray-400 hover:text-gray-600">
                    <Edit2 className="w-4 h-4" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Lead bearbeiten</DialogTitle>
                    <DialogDescription>
                      Bearbeiten Sie die Details des Leads hier. Klicken Sie auf Speichern, wenn Sie fertig sind.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto py-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Name</label>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <input
                        value={editForm.email || ''}
                        onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Phone</label>
                      <input
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Website</label>
                      <input
                        value={editForm.website || ''}
                        onChange={(e) => setEditForm({...editForm, website: e.target.value})}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Address</label>
                      <textarea
                        value={editForm.address || ''}
                        onChange={(e) => setEditForm({...editForm, address: e.target.value})}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                        rows={2}
                      />
                    </div>
                    
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <h4 className="text-xs font-medium text-gray-500 mb-3">BENUTZERDEFINIERTE FELDER</h4>
                      <div className="space-y-3">
                        {customFields?.filter(cf => cf.entity_type === 'lead').map(field => {
                          const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                          const fieldValue = editForm.custom_fields?.[fieldKey] || '';
                          
                          return (
                            <div key={field.id}>
                              <label className="block text-xs text-gray-500 mb-1 capitalize">{field.name}</label>
                              {field.field_type === 'text' && (
                                <input
                                  type="text"
                                  value={fieldValue}
                                  onChange={(e) => {
                                    const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                                    setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                                  }}
                                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                              )}
                              {field.field_type === 'number' && (
                                <input
                                  type="number"
                                  value={fieldValue}
                                  onChange={(e) => {
                                    const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                                    setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                                  }}
                                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                              )}
                              {field.field_type === 'date' && (
                                <input
                                  type="date"
                                  value={fieldValue}
                                  onChange={(e) => {
                                    const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                                    setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                                  }}
                                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                />
                              )}
                              {field.field_type === 'select' && (
                                <select
                                  value={fieldValue}
                                  onChange={(e) => {
                                    const updatedCustomFields = { ...editForm.custom_fields, [fieldKey]: e.target.value };
                                    setEditForm({ ...editForm, custom_fields: updatedCustomFields });
                                  }}
                                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                                >
                                  <option value="">-- Select --</option>
                                  {field.options?.map((option, idx) => (
                                    <option key={idx} value={option}>{option}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditForm(lead)}>Abbrechen</Button>
                    <Button onClick={handleSave}>Speichern</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              {lead.email && (
                <div className="flex items-center text-sm text-gray-600">
                  <Mail className="w-4 h-4 mr-2 text-gray-400" />
                  <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="w-4 h-4 mr-2 text-gray-400" />
                  <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">{lead.phone}</a>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center text-sm text-gray-600">
                  <Globe className="w-4 h-4 mr-2 text-gray-400" />
                  {formatUrlAsLink(lead.website)}
                </div>
              )}
              {lead.address && (
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                  <span>{lead.address}</span>
                </div>
              )}
              
              {customFields?.filter(cf => cf.entity_type === 'lead').map(field => {
                const fieldKey = field.name.toLowerCase().replace(/\s+/g, '_');
                const fieldValue = lead.custom_fields?.[fieldKey];
                
                if (!fieldValue) return null;
                
                return (
                  <div key={field.id} className="flex items-center text-sm text-gray-600">
                    <span className="font-medium mr-2">{field.name}:</span>
                    <span>{fieldValue}</span>
                  </div>
                );
              })}
              
              <div className="pt-3">
                <Button
                  onClick={onConvertToDeal}
                  className={cn(
                    "w-full flex items-center justify-center",
                    lead.status === 'qualified' 
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  )}
                >
                  <ArrowRight className="w-4 h-4 mr-2" />
                  Convert to Deal
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="w-3/5 p-4">
          <h4 className="text-sm font-medium text-gray-900 mb-4">AKTIVITÄTEN & NOTIZEN</h4>
          
          <div className="mb-4">
            <Textarea
              placeholder="Notiz hinzufügen..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="w-full mb-2"
              rows={3}
            />
            <Button 
              onClick={handleAddNote} 
              disabled={!newNote.trim()}
              className="w-full"
            >
              <Send className="w-4 h-4 mr-2" />
              Notiz speichern
            </Button>
          </div>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="all">Alle</TabsTrigger>
              <TabsTrigger value="notes">Notizen</TabsTrigger>
              <TabsTrigger value="activities">Aktivitäten</TabsTrigger>
              {selectedActivityTemplate && (
                <TabsTrigger value="custom-activity">
                  {activityTemplates?.find(t => t.id === selectedActivityTemplate)?.name || 'Custom Activity'}
                </TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="all" className="space-y-4">
              {activityTemplates ? (
                lead.activities?.map(activity => {
                  console.log('Rendering activity:', activity);
                  const template = activity.type === 'custom' && activity.template_id ? 
                    activityTemplates?.find(t => t.id === activity.template_id) : null;
                  
                  const activityTitle = activity.type === 'note' ? 'Notiz' : 
                                        activity.type === 'custom' ? template?.name || 'Custom Activity' : 
                                        activity.type;

                  return (
                    <div key={activity.id} className="p-3 bg-gray-50 rounded-md mb-2">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-gray-500">
                          {new Date(activity.created_at).toLocaleString()}
                        </span>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">
                            {activityTitle}
                          </Badge>
                          <button
                            onClick={() => onDeleteActivity(activity.id, 'lead', lead.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {activity.type === 'custom' ? (
                        template ? (
                          <div className="text-sm">
                            <p className="font-semibold">{activityTitle}</p>
                            {Object.entries(activity.template_data || {}).map(([key, value]) => (
                              <p key={key}><span className="font-medium">{key}:</span> {String(value)}</p>
                            ))}
                          </div>
                        ) : (
                           <div className="text-sm text-gray-500">Details für unbekannte benutzerdefinierte Aktivität (ID: {activity.template_id || 'N/A'})</div>
                        )
                      ) : (
                        <p className="text-sm">{activity.content}</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Lädt Aktivitäten...</p>
                </div>
              )}

              {activityTemplates && (!lead.activities || lead.activities.length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p>Keine Aktivitäten vorhanden</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="notes" className="space-y-4">
              {lead.activities?.filter(a => a.type === 'note').map(activity => (
                <div key={activity.id} className="p-3 bg-gray-50 rounded-md mb-2">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs text-gray-500">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                    <button
                      onClick={() => onDeleteActivity(activity.id, 'lead', lead.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm">{activity.content}</p>
                </div>
              ))}
              
              {(!lead.activities || lead.activities.filter(a => a.type === 'note').length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p>Keine Notizen vorhanden</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="activities" className="space-y-4">
              {activityTemplates ? (
                lead.activities?.filter(a => a.type !== 'note').map(activity => {
                  console.log('Rendering activity (filtered):', activity);
                  const template = activity.type === 'custom' && activity.template_id ? 
                    activityTemplates?.find(t => t.id === activity.template_id) : null;
                  
                  const activityTitle = activity.type === 'custom' ? template?.name || 'Custom Activity' : activity.type;

                  return (
                    <div key={activity.id} className="p-3 bg-gray-50 rounded-md mb-2">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-gray-500">
                          {new Date(activity.created_at).toLocaleString()}
                        </span>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline">
                            {activityTitle}
                          </Badge>
                          <button
                            onClick={() => onDeleteActivity(activity.id, 'lead', lead.id)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {activity.type === 'custom' ? (
                        template ? (
                          <div className="text-sm">
                            <p className="font-semibold">{activityTitle}</p>
                            {Object.entries(activity.template_data || {}).map(([key, value]) => (
                              <p key={key}><span className="font-medium">{key}:</span> {String(value)}</p>
                            ))}
                          </div>
                        ) : (
                           <div className="text-sm text-gray-500">Details für unbekannte benutzerdefinierte Aktivität (ID: {activity.template_id || 'N/A'})</div>
                        )
                      ) : (
                        <p className="text-sm">{activity.content}</p>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Lädt Aktivitäten...</p>
                </div>
              )}

              {activityTemplates && (!lead.activities || lead.activities.filter(a => a.type !== 'note').length === 0) && (
                <div className="text-center py-8 text-gray-500">
                  <p>Keine Aktivitäten vorhanden</p>
                </div>
              )}
            </TabsContent>
            
            {selectedActivityTemplate && (
              <TabsContent value="custom-activity" className="space-y-4">
                <h4 className="text-md font-medium mb-4">
                  Details für {activityTemplates?.find(t => t.id === selectedActivityTemplate)?.name || 'Custom Activity'}
                </h4>
                
                <div className="space-y-4">
                  {activityTemplates?.find(t => t.id === selectedActivityTemplate)?.fields.map((field, index) => (
                    <div key={index}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {field.name}{field.required && <span className="text-red-500">*</span>}
                      </label>
                      {field.type === 'text' && (
                        <Input
                          type="text"
                          value={activityFormData[field.name] || ''}
                          onChange={(e) => setActivityFormData({...activityFormData, [field.name]: e.target.value})}
                          required={field.required}
                        />
                      )}
                      {field.type === 'number' && (
                        <Input
                          type="number"
                          value={activityFormData[field.name] || ''}
                          onChange={(e) => setActivityFormData({...activityFormData, [field.name]: e.target.value})}
                          required={field.required}
                        />
                      )}
                      {field.type === 'date' && (
                        <Input
                          type="date"
                          value={activityFormData[field.name] || ''}
                          onChange={(e) => setActivityFormData({...activityFormData, [field.name]: e.target.value})}
                          required={field.required}
                        />
                      )}
                      {field.type === 'select' && field.options && (
                        <Select
                          value={activityFormData[field.name] || ''}
                          onValueChange={(value) => setActivityFormData({...activityFormData, [field.name]: value})}
                          required={field.required}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={`Select ${field.name}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((option, optionIndex) => (
                              <SelectItem key={optionIndex} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {field.type === 'checkbox' && (
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={!!activityFormData[field.name]}
                            onChange={(e) => setActivityFormData({...activityFormData, [field.name]: e.target.checked})}
                            required={field.required}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                          />
                          <label className="ml-2 block text-sm text-gray-900">
                            {field.name}
                          </label>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                <Button 
                  onClick={handleAddCustomActivity}
                  className="w-full"
                  disabled={!activityTemplates?.find(t => t.id === selectedActivityTemplate)?.fields.every(field => !field.required || activityFormData[field.name])}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aktivität speichern
                </Button>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
};
