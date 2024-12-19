const EvaluationBar = ({ evaluation, isMate, mateIn, isReviewMode }) => {
    if (!isReviewMode) return null;
  
    const getPercentage = () => {
      if (isMate) {
        return mateIn > 0 ? 100 : 0;
      }
      const maxEval = 10;
      const percentage = 50 + (evaluation / maxEval) * 50;
      return Math.min(Math.max(percentage, 0), 100);
    };
  
    const percentage = getPercentage();
    
    const getDisplayText = () => {
      if (isMate) {
        return `M${Math.abs(mateIn)}`;
      }
      return evaluation > 0 ? `+${evaluation.toFixed(2)}` : evaluation.toFixed(2);
    };
  
    return (
      <div 
        className="h-[600px] w-8 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden 
                   flex flex-col relative mr-4 select-none"
        style={{ minHeight: '600px' }}
      >
        {/* Black's territory */}
        <div
          className="w-full bg-gray-800 transition-all duration-300 ease-in-out"
          style={{ height: `${100 - percentage}%` }}
        />
        
        {/* White's territory */}
        <div
          className="w-full bg-white border border-gray-300 transition-all duration-300 ease-in-out"
          style={{ height: `${percentage}%` }}
        />
        
        {/* Evaluation text */}
        <div 
          className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
          style={{ writingMode: 'vertical-rl' }}
        >
          <span className="text-xs font-mono font-bold text-blue-600 bg-white/80 px-1 rounded">
            {getDisplayText()}
          </span>
        </div>
  
        {/* Center line */}
        <div 
          className="absolute left-0 right-0 h-[2px] bg-gray-400"
          style={{ top: '50%' }}
        />
      </div>
    );
  };
  
  export default EvaluationBar;