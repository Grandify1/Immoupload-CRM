
import React from 'react';
import { cn } from '@/lib/utils';
import { Users, Target, BarChart3, Settings, Filter, Mail, Bot, Eye } from 'lucide-react';
import { SavedFilter } from '@/types/database';

interface SidebarProps {
  activeSection: 'leads' | 'opportunities' | 'reports' | 'settings' | 'email' | 'scraper';
  onSectionChange: (section: 'leads' | 'opportunities' | 'reports' | 'settings' | 'email' | 'scraper') => void;
  savedFilters: SavedFilter[];
  currentFilters: Record<string, any>;
  onFilterSelect: (filters: Record<string, any>) => void;
  smartViews?: Array<{id: string, name: string, filters: Array<{field: string, operator: string, value: string}>, createdAt: string}>;
  onSmartViewSelect?: (filters: Array<{field: string, operator: string, value: string}>) => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  activeSection,
  onSectionChange,
  savedFilters,
  currentFilters,
  onFilterSelect,
  smartViews = [],
  onSmartViewSelect
}) => {
  const mainMenuItems = [
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
      id: 'scraper' as const,
      label: 'Scraper',
      icon: Bot,
      count: null
    },
    {
      id: 'reports' as const,
      label: 'Reports',
      icon: BarChart3,
      count: null
    }
  ];

  const bottomMenuItem = {
    id: 'settings' as const,
    label: 'Settings',
    icon: Settings,
    count: null
  };

  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 h-full text-white flex flex-col">
      <div className="p-4 flex-1">
        <h2 className="text-lg font-semibold text-white mb-6">CRM Dashboard</h2>
        
        {/* Main Navigation */}
        <nav className="space-y-2">
          {mainMenuItems.map((item) => {
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

        {/* Divider */}
        {smartViews.length > 0 && (
          <div className="my-6 border-t border-gray-700"></div>
        )}

        {/* SmartViews Section */}
        {smartViews.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center">
              <Eye className="w-4 h-4 mr-2" />
              SmartViews
            </h3>
            <div className="space-y-1">
              {smartViews.map((view) => (
                <button
                  key={view.id}
                  onClick={() => onSmartViewSelect?.(view.filters)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded transition-colors group"
                  title={`${view.name} - ${view.filters.length} Filter`}
                >
                  <div className="flex items-center">
                    <span className="truncate flex-1">{view.name}</span>
                    <span className="text-xs text-gray-500 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {view.filters.length}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

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

      {/* Settings at the bottom */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => onSectionChange(bottomMenuItem.id)}
          className={cn(
            "w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors",
            activeSection === bottomMenuItem.id
              ? "bg-gray-700 text-blue-300"
              : "text-gray-300 hover:bg-gray-700"
          )}
        >
          <Settings className="w-5 h-5 mr-3" />
          {bottomMenuItem.label}
        </button>
      </div>
    </div>
  );
});
