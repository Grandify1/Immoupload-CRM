
import React from 'react';
import { cn } from '@/lib/utils';
import { Users, Target, BarChart3, Settings, Filter, Mail } from 'lucide-react';
import { SavedFilter } from '@/types/database';

interface SidebarProps {
  activeSection: 'leads' | 'opportunities' | 'reports' | 'settings' | 'email';
  onSectionChange: (section: 'leads' | 'opportunities' | 'reports' | 'settings' | 'email') => void;
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
      id: 'email' as const,
      label: 'Email',
      icon: Mail,
      count: null
    },
    {
      id: 'reports' as const,
      label: 'Reports',
      icon: BarChart3,
      count: null
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      icon: Settings,
      count: null
    }
  ];

  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 h-full text-white">
      <div className="p-4">
        <h2 className="text-lg font-semibold text-white mb-6">CRM Dashboard</h2>
        
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
                    ? "bg-gray-700 text-blue-300"
                    : "text-gray-300 hover:bg-gray-700"
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
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              Saved Filters
            </h3>
            <div className="space-y-1">
              {savedFilters.map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => onFilterSelect(filter.filters)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded"
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
