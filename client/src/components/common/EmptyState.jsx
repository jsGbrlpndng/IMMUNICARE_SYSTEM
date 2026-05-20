import React from 'react';
import { Database, SearchX, Inbox } from 'lucide-react';

const EmptyState = ({ 
    type = 'data', 
    title = 'No Records Found', 
    message = 'We couldn\'t find any data matching your current filters or selection.',
    className = ''
}) => {
    const Icons = {
        search: SearchX,
        inbox: Inbox,
        data: Database
    };
    
    const Icon = Icons[type] || Icons.data;

    return (
        <div className={`flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] ${className} animate-in fade-in slide-in-from-bottom-2 duration-700`}>
            <div className="w-16 h-16 bg-white border border-slate-200 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                <Icon className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2 tracking-tight">{title}</h3>
            <p className="text-slate-500 text-sm font-semibold max-w-xs leading-relaxed">
                {message}
            </p>
        </div>
    );
};

export default EmptyState;
