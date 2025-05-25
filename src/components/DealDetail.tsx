
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
  DollarSign
} from 'lucide-react';
import { Deal, Activity } from '@/types/database';
import { cn } from '@/lib/utils';

interface DealDetailProps {
  deal: Deal;
  onClose: () => void;
  onAddActivity: (activity: Omit<Activity, 'id' | 'team_id' | 'created_at'>) => void;
  onUpdateDeal: (dealId: string, updates: Partial<Deal>) => void;
  allDeals: Deal[];
  onDealSelect: (deal: Deal) => void;
}

const statusColors = {
  lead: 'bg-gray-500',
  qualified: 'bg-blue-500',
  proposal: 'bg-yellow-500',
  negotiation: 'bg-orange-500',
  won: 'bg-green-500',
  lost: 'bg-red-500'
};

const statusLabels = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost'
};

export const DealDetail: React.FC<DealDetailProps> = ({
  deal,
  onClose,
  onAddActivity,
  onUpdateDeal,
  allDeals,
  onDealSelect
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(deal);
  const [newNote, setNewNote] = useState('');

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

  const handleSave = () => {
    onUpdateDeal(deal.id, editForm);
    setIsEditing(false);
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">{deal.name}</h2>
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
            statusColors[deal.status]
          )}>
            {statusLabels[deal.status]}
          </span>
          <div className="flex items-center text-sm text-green-600">
            <DollarSign className="w-4 h-4 mr-1" />
            {formatCurrency(deal.value)}
          </div>
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
                <label className="block text-xs text-gray-500 mb-1">Value</label>
                <input
                  type="number"
                  value={editForm.value}
                  onChange={(e) => setEditForm({...editForm, value: parseFloat(e.target.value) || 0})}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Expected Close Date</label>
                <input
                  type="date"
                  value={editForm.expected_close_date || ''}
                  onChange={(e) => setEditForm({...editForm, expected_close_date: e.target.value})}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
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
                    setEditForm(deal);
                  }}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center text-sm text-green-600">
                <DollarSign className="w-4 h-4 mr-1" />
                <span>{formatCurrency(deal.value)}</span>
              </div>
              {deal.expected_close_date && (
                <div className="text-sm text-gray-600">
                  Expected close: {new Date(deal.expected_close_date).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>

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
