
import React from 'react';
import { cn } from '@/lib/utils';
import { Users, Target, BarChart3, Settings, Filter } from 'lucide-react';
import { SavedFilter } from '@/types/database';

interface SidebarProps {
  activeSection: 'leads' | 'opportunities' | 'reports';
  onSectionChange: (section: 'leads' | 'opportunities' | 'reports') => void;
  savedFilters: SavedFilter[];
  currentFilters: Record<string, any>;
  onFilterSelect: (filters: Record<string, any>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSectionChange,
  savedFilters,
  currentFilters,
  onFilterSelect
}) => {
  const menuItems = [
    {
      id: 'leads' as const,
      label: 'Leads',
      icon: Users,
      count: null
    },
    {
      id: 'opportunities' as const,
      label: 'Opportunities',
      icon: Target,
      count: null
    },
    {
      id: 'reports' as const,
      label: 'Reports',
      icon: BarChart3,
      count: null
    }
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-full">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">CRM Dashboard</h2>
        
        {/* Navigation */}
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                  activeSection === item.id
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
                {item.count && (
                  <span className="ml-auto bg-gray-200 text-gray-600 px-2 py-1 rounded-full text-xs">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Saved Filters */}
        {savedFilters.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              Saved Filters
            </h3>
            <div className="space-y-1">
              {savedFilters.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => onFilterSelect(filter.filters)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
                >
                  {filter.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
