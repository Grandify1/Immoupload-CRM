import React, { useState } from 'react';
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
  Plus,
  Send,
  DollarSign,
  Trash2,
  StickyNote,
  User,
  FolderOpen,
  Briefcase
} from 'lucide-react';
import { Deal, Activity } from '@/types/database';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface DealDetailProps {
  deal: Deal;
  onClose: () => void;
  onAddActivity: (activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => void;
  onUpdateDeal: (dealId: string, updates: Partial<Deal>) => void;
  allDeals: Deal[];
  onDealSelect: (deal: Deal) => void;
  onDeleteActivity: (activityId: string, entityType: string, entityId: string) => void;
  customFields?: any[]; // Custom fields Prop hinzufügen (Typ anpassen, wenn CustomField Typ verfügbar)
  linkedLead?: any; // Prop für den verknüpften Lead hinzufügen (Typ anpassen, wenn Lead Typ verfügbar)
  onLeadClick?: (lead: any) => void; // Neue Prop für Lead-Klick-Handler
}

// TODO: Dynamische Stati und Farben aus Supabase laden
const statusColors: Record<string, string> = {
  new: 'bg-gray-500',
  lead: 'bg-blue-500',
  qualified: 'bg-purple-500',
  proposal: 'bg-yellow-500',
  negotiation: 'bg-orange-500',
  won: 'bg-green-500',
  lost: 'bg-red-500',
  closed: 'bg-gray-400',
  appointment_no_show: 'bg-indigo-500',
  meeting_booked: 'bg-teal-500',
  internal_drafting_sow: 'bg-pink-500',
  sow_sent: 'bg-brown-500',
};

const statusLabels: Record<string, string> = {
  new: 'New',
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
  closed: 'Closed',
  appointment_no_show: 'Appointment No Show',
  meeting_booked: 'Meeting Booked',
  internal_drafting_sow: 'Internal Drafting SOW',
  sow_sent: 'SOW Sent',
};

export const DealDetail: React.FC<DealDetailProps> = ({
  deal,
  onClose,
  onAddActivity,
  onUpdateDeal,
  allDeals,
  onDealSelect,
  onDeleteActivity,
  customFields,
  linkedLead,
  onLeadClick
}) => {
  const [isEditingAbout, setIsEditingAbout] = useState(false); // Separate Bearbeitungszustände
  const [editForm, setEditForm] = useState(deal);
  const [newNote, setNewNote] = useState('');

  // TODO: Navigation zwischen Deals in CRMLayout oder hier dynamisch implementieren
  const currentIndex = allDeals.findIndex(d => d.id === deal.id);
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < allDeals.length - 1;

  const navigateTo = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && hasPrevious) {
      onDealSelect(allDeals[currentIndex - 1]);
    } else if (direction === 'next' && hasNext) {
      onDealSelect(allDeals[currentIndex + 1]);
    }
  };

  const handleSaveAbout = () => {
    onUpdateDeal(deal.id, editForm);
    setIsEditingAbout(false);
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      onAddActivity({
        entity_type: 'deal',
        entity_id: deal.id,
        type: 'note',
        content: newNote,
        author_id: '', // This will be set by the backend
        template_data: {}
      });
      setNewNote('');
    }
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  // Filtere Custom Fields, die für Deals relevant sind
  const dealCustomFields = customFields?.filter(field => field.entity_type === 'deal') || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"> {/* Overlay Hintergrund */}
      <div className="relative bg-white rounded-lg shadow-lg flex flex-col h-full max-h-[90vh] overflow-hidden" style={{ minWidth: '50vw' }}> {/* Overlay Container */}
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0"> {/* flex-shrink-0 damit Header nicht schrumpft */}
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-bold text-gray-900">{deal.name}</h2>
            <Badge className={cn(
              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white",
              statusColors[deal.status] || 'bg-gray-500' // Fallback Farbe
            )}>
              {statusLabels[deal.status] || deal.status} {/* Fallback Label */}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            {/* Navigation Buttons (optional, je nach gewünschter UX) */}
            {/* <button
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
            </button> */}
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-3 border-b border-gray-200 flex items-center space-x-2 flex-shrink-0"> {/* flex-shrink-0 damit Action Buttons nicht schrumpfen */}
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
          {/* Weitere Buttons wie SMS, Activity, etc. können hier hinzugefügt werden */}
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto flex"> {/* flex-1 damit Content den restlichen Platz einnimmt, overflow-y-auto für vertikales Scrollen, flex für Spaltenlayout */}

          {/* Left Column (About, Custom Fields, Contacts) */}
          <div className="w-1/3 border-r border-gray-200 p-6 space-y-6 flex-shrink-0"> {/* Feste Breite oder flexibler W-Anteil */}

            {/* About Section */}
            <Accordion type="single" collapsible defaultValue="about-section">
              <AccordionItem value="about-section">
                <AccordionTrigger className="text-sm font-medium text-gray-900 py-2">ABOUT</AccordionTrigger>
                <AccordionContent className="pt-2">
                  {isEditingAbout ? (
                    <div className="space-y-3 text-sm">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Name</label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                          className="w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Value</label>
                        <Input
                          type="number"
                          value={editForm.value}
                          onChange={(e) => setEditForm({...editForm, value: parseFloat(e.target.value) || 0})}
                          className="w-full text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Expected Close Date</label>
                        <Input
                          type="date"
                          value={editForm.expected_close_date || ''}
                          onChange={(e) => setEditForm({...editForm, expected_close_date: e.target.value})}
                          className="w-full text-sm"
                        />
                      </div>
                      <div className="flex space-x-2">
                        <Button onClick={handleSaveAbout} size="sm">Save</Button>
                        <Button onClick={() => { setIsEditingAbout(false); setEditForm(deal); }} size="sm" variant="outline">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center text-sm text-green-600">
                        <DollarSign className="w-4 h-4 mr-1" />
                        <span>{formatCurrency(deal.value)}</span>
                      </div>
                      {deal.expected_close_date && (
                        <div className="text-sm text-gray-600">
                          Expected close: {new Date(deal.expected_close_date).toLocaleDateString()}
                        </div>
                      )}
                      {/* Weitere About-Infos hier hinzufügen */}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Custom Fields Section */}
            {dealCustomFields.length > 0 && (
              <Accordion type="single" collapsible defaultValue="custom-fields-section">
                 <AccordionItem value="custom-fields-section">
                   <AccordionTrigger className="text-sm font-medium text-gray-900 py-2">CUSTOM FIELDS</AccordionTrigger>
                   <AccordionContent className="pt-2 text-sm space-y-3">
                      {/* TODO: Custom Fields hier rendern und Bearbeitungsfunktionalität hinzufügen */}
                      {dealCustomFields.map(field => (
                         <div key={field.id}>
                            <div className="text-xs text-gray-500">{field.label || field.name}</div>
                            <div>
                               {/* Wert des Custom Fields anzeigen */}
                               {deal.custom_fields?.[field.name.toLowerCase().replace(/\s+/g, '_')] ?
                                  String(deal.custom_fields[field.name.toLowerCase().replace(/\s+/g, '_')]).split(',').map((item, index) => (
                                     <Badge key={index} variant="secondary" className="mr-1 mb-1">{item.trim()}</Badge>
                                  ))
                                  : '-' // Oder passendere Darstellung für verschiedene Feldtypen
                               }
                            </div>
                         </div>
                      ))}
                   </AccordionContent>
                 </AccordionItem>
              </Accordion>
            )}

            {/* Leads Section */}
            {linkedLead && (
              <Accordion type="single" collapsible defaultValue="leads-section">
                <AccordionItem value="leads-section">
                  <AccordionTrigger className="text-sm font-medium text-gray-900 py-2">LEAD</AccordionTrigger>
                  <AccordionContent className="pt-2 text-sm space-y-2">
                    <div 
                      className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded-md"
                      onClick={() => onLeadClick?.(linkedLead)}
                    >
                      <Briefcase className="w-4 h-4 text-gray-500"/>
                      <span className="text-blue-600 hover:underline">{linkedLead.name}</span>
                    </div>
                    {/* Weitere Lead-Infos hier hinzufügen */}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

          </div>

          {/* Right Column (Activity Feed) */}
          <div className="flex-1 p-6 space-y-6"> {/* flex-1 damit Activity Feed den restlichen Platz einnimmt */}

            {/* Add Activity Input */}
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

            {/* Activity Feed */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Activities</h4>
              <div className="space-y-4">
                {/* TODO: Aktivitäten hier rendern */}
                {deal.activities && deal.activities.length > 0 ? (
                   deal.activities.map((activity) => (
                      <div key={activity.id} className="border rounded-md p-3 bg-gray-50">
                         <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                            <span>{activity.type}</span> {/* Aktivitätstyp */}
                            <span>{new Date(activity.created_at).toLocaleString()}</span> {/* Zeitstempel */}
                         </div>
                         <p className="text-sm text-gray-800">{activity.content}</p> {/* Aktivitätsinhalt */}
                         {/* Weitere Aktivitätsdetails (Autor, etc.) hier hinzufügen */}
                      </div>
                   ))
                ) : (
                   <div className="text-sm text-gray-500">No activities yet.</div>
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

// Helper function to format date - kann eventuell global sein
// function formatDate(dateString: string | null) {
//   if (!dateString) return '-';
//   try {
//     const date = new Date(dateString);
//     if (isNaN(date.getTime())) {
//       return '-';
//     }
//     return date.toLocaleDateString();
//   } catch (error) {
//     console.error('Error formatting date:', dateString, error);
//     return '-';
//   }
// }

// Helper function to format currency - kann eventuell global sein
// function formatCurrency(value: number | null | undefined) {
//   if (value === null || value === undefined) return '-';
//   return new Intl.NumberFormat('de-DE', {
//     style: 'EUR',
//     currency: 'EUR',
//   }).format(value);
// }

export default DealDetail;
