
import React, { useState, useMemo } from 'react';
import { 
  MoreHorizontal, 
  Phone, 
  Mail, 
  Plus, 
  Filter,
  LayoutGrid,
  List,
  ArrowUpDown,
  Search
} from 'lucide-react';
import { Lead } from './CRMLayout';
import { cn } from '@/lib/utils';

interface LeadsViewProps {
  leads: Lead[];
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  filters: Record<string, any>;
  onLeadSelect: (lead: Lead) => void;
  onLeadUpdate: (leadId: string, updates: Partial<Lead>) => void;
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

export const LeadsView: React.FC<LeadsViewProps> = ({
  leads,
  view,
  onViewChange,
  filters,
  onLeadSelect,
  onLeadUpdate
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Lead>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredLeads = useMemo(() => {
    let filtered = leads.filter(lead => {
      // Apply search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (!lead.name.toLowerCase().includes(searchLower) &&
            !lead.email?.toLowerCase().includes(searchLower) &&
            !lead.phone?.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Apply filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          const leadValue = lead[key as keyof Lead];
          if (leadValue !== value) {
            return false;
          }
        }
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortDirection === 'asc' 
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }
      
      const aStr = String(aValue || '').toLowerCase();
      const bStr = String(bValue || '').toLowerCase();
      
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });

    return filtered;
  }, [leads, searchTerm, filters, sortField, sortDirection]);

  const handleSort = (field: keyof Lead) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
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

  const renderTableView = () => (
    <div className="flex-1 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Leads</h1>
          <div className="flex items-center space-x-2">
            <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              <Mail className="w-4 h-4" />
            </button>
            <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
              <Phone className="w-4 h-4" />
            </button>
            <button className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button 
            onClick={() => onViewChange('table')}
            className={cn(
              "flex items-center space-x-2 px-3 py-2 rounded-md",
              view === 'table' ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <List className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onViewChange('kanban')}
            className={cn(
              "flex items-center space-x-2 px-3 py-2 rounded-md",
              view === 'kanban' ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
            )}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full border border-gray-300 rounded-md pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <button className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
            <Filter className="w-4 h-4" />
            <span>Add Filter</span>
          </button>
          
          <span className="text-sm text-gray-500">
            {filteredLeads.length} Leads
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button 
                  onClick={() => handleSort('name')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Name</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contacts
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <button 
                  onClick={() => handleSort('status')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Status</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                URL
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Owner name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredLeads.map((lead) => (
              <tr 
                key={lead.id} 
                onClick={() => onLeadSelect(lead)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 mr-3">
                      {lead.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{lead.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {lead.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={cn(
                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white",
                    statusColors[lead.status]
                  )}>
                    {statusLabels[lead.status]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 hover:text-blue-800">
                  {lead.website && (
                    <a href={lead.website} target="_blank" rel="noopener noreferrer">
                      {lead.website}
                    </a>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {lead.owner}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center space-x-2">
                    <button className="text-gray-400 hover:text-gray-600">
                      <Phone className="w-4 h-4" />
                    </button>
                    <button className="text-gray-400 hover:text-gray-600">
                      <Mail className="w-4 h-4" />
                    </button>
                    <button className="text-gray-400 hover:text-gray-600">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderKanbanView = () => {
    const statusColumns = ['potential', 'contacted', 'qualified', 'closed'] as const;
    
    return (
      <div className="flex-1 bg-gray-100 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">Leads - Kanban View</h1>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => onViewChange('table')}
              className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:bg-gray-200 rounded-md"
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => onViewChange('kanban')}
              className="flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-700 rounded-md"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {statusColumns.map((status) => {
            const columnLeads = filteredLeads.filter(lead => lead.status === status);
            
            return (
              <div key={status} className="bg-white rounded-lg shadow-sm">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900 capitalize">{statusLabels[status]}</h3>
                  <span className="text-sm text-gray-500">{columnLeads.length} leads</span>
                </div>
                <div className="p-4 space-y-3 min-h-96">
                  {columnLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => onLeadSelect(lead)}
                      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <h4 className="font-medium text-gray-900 text-sm mb-2">{lead.name}</h4>
                      {lead.email && (
                        <p className="text-xs text-gray-600 mb-1">{lead.email}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white",
                          statusColors[lead.status]
                        )}>
                          {statusLabels[lead.status]}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDate(lead.updatedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return view === 'table' ? renderTableView() : renderKanbanView();
};
