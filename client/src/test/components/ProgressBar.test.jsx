import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProgressBar from './ProgressBar';

describe('ProgressBar Component', () => {
  describe('Basic Rendering', () => {
    it('renders progress bar with default value of 0', () => {
      const { container } = render(<ProgressBar />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });

    it('renders progress bar with specified value', () => {
      const { container } = render(<ProgressBar value={50} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '50');
    });

    it('renders filled progress bar at correct width', () => {
      const { container } = render(<ProgressBar value={75} />);
      const filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '75%' });
    });
  });

  describe('Value Constraints', () => {
    it('clamps value to 0 when negative', () => {
      const { container } = render(<ProgressBar value={-10} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
      
      const filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '0%' });
    });

    it('clamps value to 100 when over 100', () => {
      const { container } = render(<ProgressBar value={150} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
      
      const filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '100%' });
    });

    it('handles decimal values correctly', () => {
      const { container } = render(<ProgressBar value={33.33} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '33.33');
      
      const filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '33.33%' });
    });

    it('handles zero value', () => {
      const { container } = render(<ProgressBar value={0} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
      
      const filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '0%' });
    });

    it('handles 100% value', () => {
      const { container } = render(<ProgressBar value={100} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '100');
      
      const filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '100%' });
    });
  });

  describe('Accessibility', () => {
    it('has role="progressbar"', () => {
      const { container } = render(<ProgressBar value={50} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('has aria-valuenow attribute', () => {
      const { container } = render(<ProgressBar value={60} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '60');
    });

    it('has aria-valuemin="0"', () => {
      const { container } = render(<ProgressBar value={50} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuemin', '0');
    });

    it('has aria-valuemax="100"', () => {
      const { container } = render(<ProgressBar value={50} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuemax', '100');
    });

    it('has descriptive aria-label', () => {
      const { container } = render(<ProgressBar value={75} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-label', 'Vaccination progress: 75% complete');
    });

    it('updates aria-label with value changes', () => {
      const { container, rerender } = render(<ProgressBar value={25} />);
      let progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-label', 'Vaccination progress: 25% complete');
      
      rerender(<ProgressBar value={80} />);
      progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-label', 'Vaccination progress: 80% complete');
    });
  });

  describe('Segment Display', () => {
    it('does not show segments when total is not provided', () => {
      const { container } = render(<ProgressBar value={50} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      expect(segments).toHaveLength(0);
    });

    it('does not show segments when total is 1', () => {
      const { container } = render(<ProgressBar value={50} total={1} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      expect(segments).toHaveLength(0);
    });

    it('shows correct number of segments when total is provided', () => {
      const { container } = render(<ProgressBar value={50} total={14} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      expect(segments).toHaveLength(14);
    });

    it('marks completed segments correctly', () => {
      const { container } = render(<ProgressBar value={50} total={10} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      
      // 50% of 10 segments = 5 completed
      const completedSegments = Array.from(segments).filter(seg => 
        seg.classList.contains('bg-blue-600')
      );
      const incompleteSegments = Array.from(segments).filter(seg => 
        seg.classList.contains('bg-slate-300')
      );
      
      expect(completedSegments).toHaveLength(5);
      expect(incompleteSegments).toHaveLength(5);
    });

    it('marks all segments as completed at 100%', () => {
      const { container } = render(<ProgressBar value={100} total={14} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      
      const completedSegments = Array.from(segments).filter(seg => 
        seg.classList.contains('bg-blue-600')
      );
      
      expect(completedSegments).toHaveLength(14);
    });

    it('marks no segments as completed at 0%', () => {
      const { container } = render(<ProgressBar value={0} total={14} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      
      const incompleteSegments = Array.from(segments).filter(seg => 
        seg.classList.contains('bg-slate-300')
      );
      
      expect(incompleteSegments).toHaveLength(14);
    });

    it('segments have aria-hidden="true"', () => {
      const { container } = render(<ProgressBar value={50} total={5} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      
      segments.forEach(segment => {
        expect(segment).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Styling and Animation', () => {
    it('applies custom className', () => {
      const { container } = render(<ProgressBar value={50} className="custom-class" />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('applies base styling classes', () => {
      const { container } = render(<ProgressBar value={50} />);
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('w-full');
    });

    it('progress bar container has correct styling', () => {
      const { container } = render(<ProgressBar value={50} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      
      expect(progressBar).toHaveClass('relative');
      expect(progressBar).toHaveClass('w-full');
      expect(progressBar).toHaveClass('h-3');
      expect(progressBar).toHaveClass('bg-slate-200');
      expect(progressBar).toHaveClass('rounded-full');
      expect(progressBar).toHaveClass('overflow-hidden');
    });

    it('filled bar has gradient and transition classes', () => {
      const { container } = render(<ProgressBar value={50} />);
      const filledBar = container.querySelector('.bg-gradient-to-r');
      
      expect(filledBar).toHaveClass('bg-gradient-to-r');
      expect(filledBar).toHaveClass('from-blue-500');
      expect(filledBar).toHaveClass('to-blue-600');
      expect(filledBar).toHaveClass('transition-all');
      expect(filledBar).toHaveClass('duration-500');
      expect(filledBar).toHaveClass('ease-out');
    });

    it('segments have transition classes', () => {
      const { container } = render(<ProgressBar value={50} total={5} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      
      segments.forEach(segment => {
        expect(segment).toHaveClass('transition-colors');
        expect(segment).toHaveClass('duration-300');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles very small values', () => {
      const { container } = render(<ProgressBar value={0.1} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0.1');
    });

    it('handles large total values', () => {
      const { container } = render(<ProgressBar value={50} total={100} />);
      const segments = container.querySelectorAll('.w-2.h-2.rounded-full');
      expect(segments).toHaveLength(100);
    });

    it('handles undefined value gracefully', () => {
      const { container } = render(<ProgressBar value={undefined} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });

    it('handles null value gracefully', () => {
      const { container } = render(<ProgressBar value={null} />);
      const progressBar = container.querySelector('[role="progressbar"]');
      expect(progressBar).toHaveAttribute('aria-valuenow', '0');
    });

    it('handles string value by converting to number', () => {
      const { container } = render(<ProgressBar value="75" />);
      const progressBar = container.querySelector('[role="progressbar"]');
      // JavaScript will coerce "75" to 75 in Math operations
      expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    });
  });

  describe('Dynamic Updates', () => {
    it('updates progress bar width when value changes', () => {
      const { container, rerender } = render(<ProgressBar value={25} />);
      let filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '25%' });
      
      rerender(<ProgressBar value={75} />);
      filledBar = container.querySelector('.bg-gradient-to-r');
      expect(filledBar).toHaveStyle({ width: '75%' });
    });

    it('updates segment completion when value changes', () => {
      const { container, rerender } = render(<ProgressBar value={25} total={10} />);
      let completedSegments = Array.from(container.querySelectorAll('.w-2.h-2.rounded-full'))
        .filter(seg => seg.classList.contains('bg-blue-600'));
      expect(completedSegments).toHaveLength(2); // 25% completes segments at 10% and 20%
      
      rerender(<ProgressBar value={75} total={10} />);
      completedSegments = Array.from(container.querySelectorAll('.w-2.h-2.rounded-full'))
        .filter(seg => seg.classList.contains('bg-blue-600'));
      expect(completedSegments).toHaveLength(7); // 75% completes segments 1-7 (10%-70%)
    });
  });
});
