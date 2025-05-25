
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
  Send
} from 'lucide-react';
import { Lead, Activity } from './CRMLayout';
import { cn } from '@/lib/utils';

interface LeadDetailProps {
  lead: Lead;
  onClose: () => void;
  onAddActivity: (leadId: string, activity: Omit<Activity, 'id' | 'createdAt'>) => void;
  onUpdateLead: (leadId: string, updates: Partial<Lead>) => void;
  allLeads: Lead[];
  onLeadSelect: (lead: Lead) => void;
}

const statusColors = {
  potential: 'bg-gray-500',
  contacted: 'bg-blue-500',
  qualified: 'bg-green-500',
  closed: 'bg-purple-500'
};

const statusLabels = {
  potential: 'Potential',
  contacted: 'Contacted', 
  qualified: 'Qualified',
  closed: 'Closed'
};

const activityIcons = {
  note: MessageSquare,
  call: Phone,
  email: Mail,
  meeting: MessageSquare,
  task: Edit2
};

export const LeadDetail: React.FC<LeadDetailProps> = ({
  lead,
  onClose,
  onAddActivity,
  onUpdateLead,
  allLeads,
  onLeadSelect
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(lead);
  const [newNote, setNewNote] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'important' | 'conversations' | 'notes'>('all');

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
      onAddActivity(lead.id, {
        type: 'note',
        content: newNote,
        author: 'dustin althaus'
      });
      setNewNote('');
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h ago`;
    } else {
      return `${Math.floor(diffInMinutes / 1440)}d ago`;
    }
  };

  const tabs = [
    { id: 'all', label: 'All', count: lead.activities.length },
    { id: 'important', label: 'Important', count: 0 },
    { id: 'conversations', label: 'Conversations', count: 0 },
    { id: 'notes', label: 'Notes & Summaries', count: lead.activities.filter(a => a.type === 'note').length }
  ];

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
        {/* Details Tab */}
        <div className="border-b border-gray-200">
          <div className="px-4 py-3">
            <h3 className="text-sm font-medium text-gray-900 mb-3">Details</h3>
          </div>
        </div>

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
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                  rows={3}
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
              {lead.address && (
                <div className="flex items-start space-x-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-sm text-gray-600">{lead.address}</span>
                </div>
              )}
              {lead.website && (
                <div className="flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <a 
                    href={lead.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {lead.website}
                  </a>
                </div>
              )}
              {lead.description && (
                <p className="text-sm text-gray-600">{lead.description}</p>
              )}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded transition-colors",
                    activeTab === tab.id
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Add Note */}
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

          {/* Activities */}
          <div className="space-y-3">
            {lead.activities.map((activity) => {
              const IconComponent = activityIcons[activity.type];
              
              return (
                <div key={activity.id} className="flex space-x-3">
                  <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                    <IconComponent className="w-4 h-4 text-yellow-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{activity.author}</span>
                      <span className="text-sm text-gray-500">created a note</span>
                      <span className="text-xs text-blue-600">{formatDate(activity.createdAt)}</span>
                    </div>
                    <p className="text-sm text-gray-600">{activity.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
