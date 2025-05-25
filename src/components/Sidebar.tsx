
import React from 'react';
import { 
  Home, 
  Users, 
  Target, 
  MessageSquare, 
  BarChart3, 
  Settings, 
  Search,
  Plus,
  Filter
} from 'lucide-react';
import { SavedFilter } from './CRMLayout';
import { cn } from '@/lib/utils';

interface SidebarProps {
  savedFilters: SavedFilter[];
  currentFilters: Record<string, any>;
  onFilterSelect: (filters: Record<string, any>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  savedFilters,
  currentFilters,
  onFilterSelect
}) => {
  const menuItems = [
    { icon: Home, label: 'Getting Started', active: false },
    { icon: MessageSquare, label: 'Inbox', active: false },
    { icon: Target, label: 'Opportunities', active: false },
    { icon: Users, label: 'Leads', active: true },
    { icon: Users, label: 'Contacts', active: false },
    { icon: MessageSquare, label: 'Workflows', active: false },
    { icon: MessageSquare, label: 'Conversations', active: false },
    { icon: BarChart3, label: 'Reports', active: false },
  ];

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
            da
          </div>
          <div>
            <div className="text-sm font-medium">dustin althaus</div>
            <div className="text-xs text-gray-400">Immoupload</div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-10 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        {menuItems.map((item, index) => (
          <div
            key={index}
            className={cn(
              "flex items-center space-x-3 px-2 py-2 rounded text-sm cursor-pointer hover:bg-gray-800 transition-colors",
              item.active && "bg-gray-800 text-white"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      {/* Smart Views */}
      <div className="px-4 py-4 border-t border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-300">SMART VIEWS</h3>
          <Filter className="w-4 h-4 text-gray-400" />
        </div>
        
        {savedFilters.map((filter) => (
          <div
            key={filter.id}
            onClick={() => onFilterSelect(filter.filters)}
            className={cn(
              "flex items-center space-x-2 px-2 py-2 rounded text-sm cursor-pointer hover:bg-gray-800 transition-colors",
              JSON.stringify(currentFilters) === JSON.stringify(filter.filters) && "bg-gray-800"
            )}
          >
            <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
            <span>{filter.name}</span>
          </div>
        ))}
        
        <div className="flex items-center space-x-2 px-2 py-2 text-sm text-gray-400 cursor-pointer hover:text-white">
          <Plus className="w-3 h-3" />
          <span>Show all</span>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center space-x-3 px-2 py-2 text-sm text-gray-400 cursor-pointer hover:text-white">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </div>
        <div className="text-xs text-gray-500 mt-2 px-2">
          Collapse
        </div>
      </div>
    </div>
  );
};
