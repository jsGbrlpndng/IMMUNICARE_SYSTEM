import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Breadcrumb Component
 * Provides navigation breadcrumbs for better UX
 * Format: Dashboard > Section > Current Page
 */
const Breadcrumb = ({ items }) => {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex items-center space-x-2 text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          
          return (
            <li key={index} className="flex items-center">
              {index > 0 && (
                <ChevronRight className="w-4 h-4 text-slate-400 mx-2" />
              )}
              
              {isLast ? (
                <span className="font-semibold text-slate-900 flex items-center gap-2">
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-2 font-medium"
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
