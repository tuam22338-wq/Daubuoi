
import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
  style?: React.CSSProperties;
  activeStyle?: string; // Added to fix TS Error
}

const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '', style, activeStyle }) => {
  // A very basic formatter to preserve whitespace and handle code blocks visually
  
  const formatText = (text: string) => {
    const lines = text.split('\n');
    let inCodeBlock = false;
    
    return lines.map((line, index) => {
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        return <div key={index} className="h-4" />; // Spacer for block
      }
      
      if (inCodeBlock) {
        return (
          <div key={index} className="bg-gray-100 dark:bg-[#1e1f20] font-mono text-[0.9em] px-4 py-0.5 text-gray-800 dark:text-gray-200 overflow-x-auto">
            {line}
          </div>
        );
      }

      // Basic bolding **text**
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <div key={index} className="min-h-[1.5em] break-words">
            {parts.map((part, i) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={i} className="font-bold text-gray-900 dark:text-gray-100">{part.slice(2, -2)}</strong>;
                }
                return <span key={i}>{part}</span>;
            })}
        </div>
      );
    });
  };

  const activeStyleClass = activeStyle === 'custom' ? 'font-serif tracking-wide text-gray-800 dark:text-gray-200' : '';

  return (
    <div 
        className={`markdown-body text-gray-800 dark:text-gray-300 leading-relaxed ${className} ${activeStyleClass}`}
        style={style}
    >
      {formatText(content)}
    </div>
  );
};

export default MarkdownView;
