const fs = require('fs');

let content = fs.readFileSync('src/app/admin/landing/page.tsx', 'utf8');

// Replace SectionPanel colors
content = content.replace(/rounded-xl border border-white\/\[0\.06\] bg-white\/\[0\.02\]/g, 'rounded-2xl border border-gray-100 bg-white shadow-sm mb-4');
content = content.replace(/hover:bg-white\/\[0\.02\]/g, 'hover:bg-gray-50\/50');
content = content.replace(/text-white shrink-0/g, 'text-gray-900 shrink-0');
content = content.replace(/text-slate-500 shrink-0/g, 'text-gray-400 shrink-0');
content = content.replace(/text-\[14px\] font-semibold text-white/g, 'text-sm font-bold text-gray-900');
content = content.replace(/text-\[12px\] text-slate-500/g, 'text-sm text-gray-500');
content = content.replace(/text-\[10px\] font-medium text-amber-400 bg-amber-500\/10 px-2 py-0\.5/g, 'text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/50 px-2.5 py-1');
content = content.replace(/border-t border-white\/\[0\.06\] px-5 py-5 space-y-4/g, 'border-t border-gray-100 px-6 py-6 space-y-5');
content = content.replace(/border-t border-white\/\[0\.06\]/g, 'border-t border-gray-100');
content = content.replace(/px-5 py-4/g, 'px-6 py-5');
content = content.replace(/bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-\[13px\] font-medium/g, 'bg-violet-600 text-white text-sm font-semibold shadow-sm shadow-violet-600/20');
content = content.replace(/disabled:opacity-40/g, 'disabled:opacity-50');
content = content.replace(/hover:brightness-110/g, 'hover:bg-violet-700');
content = content.replace(/gap-3 pt-3 border-t/g, 'gap-3 pt-5 mt-5 border-t');

// Replace Field colors
content = content.replace(/w-full bg-white\/\[0\.04\] border border-white\/\[0\.08\] rounded-lg px-3\.5 py-2\.5 text-\[13px\] text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500\/50 focus:ring-1 focus:ring-indigo-500\/20/g, 'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500');
content = content.replace(/block text-\[12px\] font-medium text-slate-400 mb-1\.5/g, 'block text-sm font-medium text-gray-700 mb-1.5');
content = content.replace(/min-h-\[80px\]/g, 'min-h-[100px]');

// Page Body header and loading
content = content.replace(/text-indigo-400/g, 'text-violet-600');
content = content.replace(/bg-gradient-to-br from-indigo-500\/20 to-violet-500\/20 border border-indigo-500\/20/g, 'bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center p-3');
content = content.replace(/text-xl font-bold text-white tracking-\[-0\.02em\]/g, 'text-2xl font-bold text-gray-900 tracking-tight');
content = content.replace(/border border-white\/\[0\.08\] rounded-lg px-3 py-2/g, 'border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm bg-white');
content = content.replace(/text-\[12px\] text-slate-400 hover:text-white/g, 'text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-gray-900');
content = content.replace(/max-w-4xl mx-auto py-6 space-y-6/g, 'max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500');
content = content.replace(/flex items-center gap-2.5/g, 'flex items-center gap-4');

// Array item blocks
content = content.replace(/p-3 rounded-lg border border-white\/\[0\.06\] bg-white\/\[0\.01\]/g, 'p-5 rounded-xl border border-gray-100 bg-gray-50');
content = content.replace(/text-\[11px\] font-semibold text-slate-500 uppercase tracking-wider/g, 'text-xs font-bold text-gray-500 uppercase tracking-wider');
content = content.replace(/text-\[11px\] text-slate-500/g, 'text-xs font-bold text-gray-500 uppercase tracking-wider');
content = content.replace(/text-slate-600 hover:text-red-400/g, 'text-gray-400 hover:text-red-600 bg-white border border-gray-200 rounded-lg p-2 hover:bg-red-50 hover:border-red-200');
content = content.replace(/text-\[11px\] font-bold text-indigo-400/g, 'text-xs font-bold text-violet-600 uppercase tracking-wider');

// Metrics blocks fix
content = content.replace(/<div key={i} className="flex items-end gap-3">/g, '<div key={i} className="flex items-end gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">');
content = content.replace(/className="p-2.5 text-slate-600 hover:text-red-400 transition-colors"/g, 'className="p-3 text-gray-400 hover:text-red-600 bg-white border border-gray-200 rounded-xl hover:bg-red-50 hover:border-red-200 transition-colors" title="Устгах"');


// Add buttons
content = content.replace(/text-\[12px\] text-indigo-400 hover:text-indigo-300/g, 'text-sm font-semibold text-violet-600 hover:text-violet-700 hover:bg-violet-50 px-3 py-2 rounded-lg');

// Pricing inside
content = content.replace(/text-\[12px\] font-bold text-white capitalize/g, 'text-sm font-bold text-gray-900 capitalize mb-2 block');

// Reset button
content = content.replace(/text-\[12px\] text-slate-600 hover:text-slate-400/g, 'text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 px-4 py-2 rounded-xl');

// Table
content = content.replace(/<table className="w-full text-\[12px\]">/g, '<table className="w-full text-sm">');
content = content.replace(/<tr className="text-slate-500">/g, '<tr className="text-gray-500 text-xs uppercase tracking-wider bg-gray-50 border-b border-gray-100">');
content = content.replace(/border-t border-white\/\[0\.04\]/g, 'border-t border-gray-100');
content = content.replace(/bg-transparent border border-white\/\[0\.06\]/g, 'bg-white border border-gray-200');
content = content.replace(/text-white focus:outline-none focus:border-indigo-500\/50/g, 'text-gray-900 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20');
content = content.replace(/bg-emerald-500\/20 text-emerald-400/g, 'bg-emerald-100 text-emerald-700');
content = content.replace(/bg-white\/\[0\.04\] text-slate-700/g, 'bg-gray-100 text-gray-400 border border-gray-200 text-transparent');


fs.writeFileSync('src/app/admin/landing/page.tsx', content);
