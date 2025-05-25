
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
  Send,
  ArrowRight
} from 'lucide-react';
import { Lead, Activity } from '@/types/database';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface LeadDetailProps {
  lead: Lead;
  onClose: () => void;
  onAddActivity: (activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => void;
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  onConvertToDeal: () => void;
  allLeads: Lead[];
  onLeadSelect: (lead: Lead) => void;
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
  onLeadSelect
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(lead);
  const [newNote, setNewNote] = useState('');

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
    if (newNote.trim()) {
      onAddActivity({
        entity_type: 'lead',
        entity_id: lead.id,
        type: 'note',
        content: newNote,
        author_id: '', // This will be set by the backend
        template_data: {}
      });
      setNewNote('');
    }
  };

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
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
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white",
            statusColors[lead.status]
          )}>
            {statusLabels[lead.status]}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            <MessageSquare className="w-4 h-4" />
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* About Section */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">ABOUT</h4>
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className="text-gray-400 hover:text-gray-600"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>

          {isEditing ? (
            <div className="space-y-3">
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
              <div className="flex space-x-2">
                <button
                  onClick={handleSave}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm(lead);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {lead.email && (
                <div className="flex items-center text-sm text-gray-600">
                  <Mail className="w-4 h-4 mr-2" />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center text-sm text-gray-600">
                  <Phone className="w-4 h-4 mr-2" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center text-sm text-gray-600">
                  <Globe className="w-4 h-4 mr-2" />
                  <span>{lead.website}</span>
                </div>
              )}
              {lead.address && (
                <div className="flex items-center text-sm text-gray-600">
                  <MapPin className="w-4 h-4 mr-2" />
                  <span>{lead.address}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Convert to Deal */}
        {lead.status === 'qualified' && (
          <div className="p-4 border-b border-gray-200">
            <Button 
              onClick={onConvertToDeal} 
              className="w-full"
              variant="default"
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Convert to Deal
            </Button>
          </div>
        )}

        {/* Add Note */}
        <div className="p-4">
          <div className="mb-4">
            <div className="flex space-x-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Add a note..."
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm resize-none"
                rows={2}
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className={cn(
                  "px-3 py-2 rounded text-sm transition-colors",
                  newNote.trim()
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
