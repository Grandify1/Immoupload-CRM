
import React from 'react';
import { 
  Target, 
  Users, 
  BarChart3, 
  Settings,
  Search,
  Plus,
  Filter,
  LogOut
} from 'lucide-react';
import { SavedFilter } from '@/types/database';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';

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
  const { signOut } = useAuth();
  const { profile, team } = useProfile();

  const menuItems = [
    { icon: Users, label: 'Leads', key: 'leads' as const },
    { icon: Target, label: 'Opportunities', key: 'opportunities' as const },
    { icon: BarChart3, label: 'Reports', key: 'reports' as const },
  ];

  const entityFilters = savedFilters.filter(filter => 
    filter.entity_type === (activeSection === 'opportunities' ? 'deal' : activeSection === 'leads' ? 'lead' : '')
  );

  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
            {profile?.first_name?.charAt(0) || profile?.email?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {profile?.first_name} {profile?.last_name}
            </div>
            <div className="text-xs text-gray-400 truncate">{team?.name}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="text-gray-400 hover:text-white p-1"
          >
            <LogOut className="w-4 h-4" />
          </Button>
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
        {menuItems.map((item) => (
          <div
            key={item.key}
            onClick={() => onSectionChange(item.key)}
            className={cn(
              "flex items-center space-x-3 px-2 py-2 rounded text-sm cursor-pointer hover:bg-gray-800 transition-colors",
              activeSection === item.key && "bg-gray-800 text-white"
            )}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      {/* Smart Views */}
      {(activeSection === 'leads' || activeSection === 'opportunities') && (
        <div className="px-4 py-4 border-t border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-300">SMART VIEWS</h3>
            <Filter className="w-4 h-4 text-gray-400" />
          </div>
          
          {entityFilters.map((filter) => (
            <div
              key={filter.id}
              onClick={() => onFilterSelect(filter.filters)}
              className={cn(
                "flex items-center space-x-2 px-2 py-2 rounded text-sm cursor-pointer hover:bg-gray-800 transition-colors",
                JSON.stringify(currentFilters) === JSON.stringify(filter.filters) && "bg-gray-800"
              )}
            >
              <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
              <span className="truncate">{filter.name}</span>
            </div>
          ))}
          
          <div className="flex items-center space-x-2 px-2 py-2 text-sm text-gray-400 cursor-pointer hover:text-white">
            <Plus className="w-3 h-3" />
            <span>Show all</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center space-x-3 px-2 py-2 text-sm text-gray-400 cursor-pointer hover:text-white">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </div>
      </div>
    </div>
  );
};
