
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
  Search,
  DollarSign
} from 'lucide-react';
import { Deal } from '@/types/database';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface OpportunitiesViewProps {
  deals: Deal[];
  view: 'table' | 'kanban';
  onViewChange: (view: 'table' | 'kanban') => void;
  filters: Record<string, any>;
  onDealSelect: (deal: Deal) => void;
  onDealUpdate: (dealId: string, updates: Partial<Deal>) => void;
  onRefresh: () => void;
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

export const OpportunitiesView: React.FC<OpportunitiesViewProps> = ({
  deals,
  view,
  onViewChange,
  filters,
  onDealSelect,
  onDealUpdate,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Deal>('updated_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredDeals = useMemo(() => {
    let filtered = deals.filter(deal => {
      // Apply search
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        if (!deal.name.toLowerCase().includes(searchLower)) {
          return false;
        }
      }

      // Apply filters
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') {
          const dealValue = deal[key as keyof Deal];
          if (dealValue !== value) {
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
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' 
          ? aValue - bValue
          : bValue - aValue;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (aValue.includes('T') && bValue.includes('T')) {
          // Date comparison
          const aDate = new Date(aValue);
          const bDate = new Date(bValue);
          return sortDirection === 'asc' 
            ? aDate.getTime() - bDate.getTime()
            : bDate.getTime() - aDate.getTime();
        }
        
        // String comparison
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      return 0;
    });

    return filtered;
  }, [deals, searchTerm, filters, sortField, sortDirection]);

  const handleSort = (field: keyof Deal) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR'
    }).format(value);
  };

  const renderTableView = () => (
    <div className="flex-1 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-gray-900">Opportunities</h1>
          <div className="flex items-center space-x-2">
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Deal
            </Button>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <Button 
            variant={view === 'table' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewChange('table')}
          >
            <List className="w-4 h-4 mr-2" />
            Table
          </Button>
          <Button 
            variant={view === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onViewChange('kanban')}
          >
            <LayoutGrid className="w-4 h-4 mr-2" />
            Kanban
          </Button>
          
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search opportunities..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Add Filter
          </Button>
          
          <span className="text-sm text-gray-500">
            {filteredDeals.length} Opportunities
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
                <button 
                  onClick={() => handleSort('value')}
                  className="flex items-center space-x-1 hover:text-gray-700"
                >
                  <span>Value</span>
                  <ArrowUpDown className="w-3 h-3" />
                </button>
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
                Expected Close
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Updated
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredDeals.map((deal) => (
              <tr 
                key={deal.id} 
                onClick={() => onDealSelect(deal)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium text-gray-600 mr-3">
                      {deal.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900">{deal.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center text-sm text-gray-900">
                    <DollarSign className="w-4 h-4 mr-1 text-green-600" />
                    {formatCurrency(deal.value)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={cn(
                    "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white",
                    statusColors[deal.status]
                  )}>
                    {statusLabels[deal.status]}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(deal.updated_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Mail className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
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
    const statusColumns = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'] as const;
    
    return (
      <div className="flex-1 bg-gray-100 p-6">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-gray-900">Opportunities - Kanban View</h1>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Deal
            </Button>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              variant={view === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewChange('table')}
            >
              <List className="w-4 h-4 mr-2" />
              Table
            </Button>
            <Button 
              variant={view === 'kanban' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewChange('kanban')}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Kanban
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-6 gap-4 overflow-x-auto">
          {statusColumns.map((status) => {
            const columnDeals = filteredDeals.filter(deal => deal.status === status);
            const totalValue = columnDeals.reduce((sum, deal) => sum + deal.value, 0);
            
            return (
              <div key={status} className="bg-white rounded-lg shadow-sm min-w-64">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-medium text-gray-900 capitalize">{statusLabels[status]}</h3>
                  <div className="text-sm text-gray-500">
                    {columnDeals.length} deals • {formatCurrency(totalValue)}
                  </div>
                </div>
                <div className="p-4 space-y-3 min-h-96">
                  {columnDeals.map((deal) => (
                    <div
                      key={deal.id}
                      onClick={() => onDealSelect(deal)}
                      className="bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                    >
                      <h4 className="font-medium text-gray-900 text-sm mb-2">{deal.name}</h4>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center text-sm text-green-600">
                          <DollarSign className="w-4 h-4 mr-1" />
                          {formatCurrency(deal.value)}
                        </div>
                        <span className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white",
                          statusColors[deal.status]
                        )}>
                          {statusLabels[deal.status]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(deal.updated_at)}
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
