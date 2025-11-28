import React from 'react';

interface MarkdownViewProps {
  content: string;
  className?: string;
}

const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  // A very basic formatter to preserve whitespace and handle code blocks visually
  // In a real production app, use 'react-markdown' or 'marked'
  
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
          <div key={index} className="bg-gray-100 font-mono text-sm px-4 py-0.5 text-gray-800">
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
                    return <strong key={i}>{part.slice(2, -2)}</strong>;
                }
                return <span key={i}>{part}</span>;
            })}
        </div>
      );
    });
  };

  return (
    <div className={`markdown-body text-gray-800 text-[15px] leading-relaxed ${className}`}>
      {formatText(content)}
    </div>
  );
};

export default MarkdownView;