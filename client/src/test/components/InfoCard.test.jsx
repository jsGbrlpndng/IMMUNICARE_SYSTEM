import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InfoCard from './InfoCard';

describe('InfoCard Component', () => {
  describe('Basic Rendering', () => {
    it('renders card with title and children', () => {
      render(
        <InfoCard title="Test Title">
          <p>Test content</p>
        </InfoCard>
      );
      
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('renders children without title', () => {
      render(
        <InfoCard>
          <p>Content without title</p>
        </InfoCard>
      );
      
      expect(screen.getByText('Content without title')).toBeInTheDocument();
    });

    it('renders with empty title', () => {
      render(
        <InfoCard title="">
          <p>Content with empty title</p>
        </InfoCard>
      );
      
      expect(screen.getByText('Content with empty title')).toBeInTheDocument();
    });

    it('renders multiple children elements', () => {
      render(
        <InfoCard title="Multiple Children">
          <p>First child</p>
          <p>Second child</p>
          <p>Third child</p>
        </InfoCard>
      );
      
      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
      expect(screen.getByText('Third child')).toBeInTheDocument();
    });
  });

  describe('Title Styling', () => {
    it('applies uppercase styling to title', () => {
      render(<InfoCard title="lowercase title"><p>Content</p></InfoCard>);
      const title = screen.getByText('lowercase title');
      
      expect(title).toHaveClass('uppercase');
    });

    it('applies bold font weight to title', () => {
      render(<InfoCard title="Bold Title"><p>Content</p></InfoCard>);
      const title = screen.getByText('Bold Title');
      
      expect(title).toHaveClass('font-bold');
    });

    it('applies small text size to title', () => {
      render(<InfoCard title="Small Title"><p>Content</p></InfoCard>);
      const title = screen.getByText('Small Title');
      
      expect(title).toHaveClass('text-xs');
    });

    it('applies gray color to title', () => {
      render(<InfoCard title="Gray Title"><p>Content</p></InfoCard>);
      const title = screen.getByText('Gray Title');
      
      expect(title).toHaveClass('text-slate-500');
    });

    it('applies letter spacing to title', () => {
      render(<InfoCard title="Spaced Title"><p>Content</p></InfoCard>);
      const title = screen.getByText('Spaced Title');
      
      expect(title).toHaveClass('tracking-wider');
    });
  });

  describe('Card Styling', () => {
    it('applies white background', () => {
      const { container } = render(<InfoCard title="Test"><p>Content</p></InfoCard>);
      const card = container.firstChild;
      
      expect(card).toHaveClass('bg-white');
    });

    it('applies rounded corners', () => {
      const { container } = render(<InfoCard title="Test"><p>Content</p></InfoCard>);
      const card = container.firstChild;
      
      expect(card).toHaveClass('rounded-xl');
    });

    it('applies border', () => {
      const { container } = render(<InfoCard title="Test"><p>Content</p></InfoCard>);
      const card = container.firstChild;
      
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('border-slate-200');
    });

    it('applies shadow', () => {
      const { container } = render(<InfoCard title="Test"><p>Content</p></InfoCard>);
      const card = container.firstChild;
      
      expect(card).toHaveClass('shadow-sm');
    });

    it('applies hover shadow transition', () => {
      const { container } = render(<InfoCard title="Test"><p>Content</p></InfoCard>);
      const card = container.firstChild;
      
      expect(card).toHaveClass('hover:shadow-md');
      expect(card).toHaveClass('transition-shadow');
    });
  });

  describe('Custom ClassName', () => {
    it('applies custom className', () => {
      const { container } = render(
        <InfoCard title="Test" className="custom-class">
          <p>Content</p>
        </InfoCard>
      );
      const card = container.firstChild;
      
      expect(card).toHaveClass('custom-class');
    });

    it('combines custom className with default classes', () => {
      const { container } = render(
        <InfoCard title="Test" className="mt-4 mb-8">
          <p>Content</p>
        </InfoCard>
      );
      const card = container.firstChild;
      
      expect(card).toHaveClass('mt-4');
      expect(card).toHaveClass('mb-8');
      expect(card).toHaveClass('bg-white');
      expect(card).toHaveClass('rounded-xl');
    });

    it('handles empty className', () => {
      const { container } = render(
        <InfoCard title="Test" className="">
          <p>Content</p>
        </InfoCard>
      );
      const card = container.firstChild;
      
      expect(card).toHaveClass('bg-white');
    });

    it('handles multiple custom classes', () => {
      const { container } = render(
        <InfoCard title="Test" className="col-span-2 lg:col-span-3 shadow-lg">
          <p>Content</p>
        </InfoCard>
      );
      const card = container.firstChild;
      
      expect(card).toHaveClass('col-span-2');
      expect(card).toHaveClass('lg:col-span-3');
      expect(card).toHaveClass('shadow-lg');
    });
  });

  describe('Layout and Structure', () => {
    it('renders title in separate header section', () => {
      const { container } = render(
        <InfoCard title="Header Title">
          <p>Body content</p>
        </InfoCard>
      );
      
      const titleContainer = screen.getByText('Header Title').parentElement;
      expect(titleContainer).toHaveClass('px-6');
      expect(titleContainer).toHaveClass('pt-5');
      expect(titleContainer).toHaveClass('pb-3');
    });

    it('applies border between title and content', () => {
      const { container } = render(
        <InfoCard title="Title">
          <p>Content</p>
        </InfoCard>
      );
      
      const titleContainer = screen.getByText('Title').parentElement;
      expect(titleContainer).toHaveClass('border-b');
      expect(titleContainer).toHaveClass('border-slate-100');
    });

    it('applies padding to content area', () => {
      const { container } = render(
        <InfoCard title="Title">
          <p>Content</p>
        </InfoCard>
      );
      
      const contentContainer = screen.getByText('Content').parentElement;
      expect(contentContainer).toHaveClass('p-6');
    });

    it('does not render title section when title is not provided', () => {
      const { container } = render(
        <InfoCard>
          <p>Content only</p>
        </InfoCard>
      );
      
      const titleElements = container.querySelectorAll('.border-b.border-slate-100');
      expect(titleElements).toHaveLength(0);
    });
  });

  describe('Semantic HTML', () => {
    it('uses h3 tag for title', () => {
      render(<InfoCard title="Semantic Title"><p>Content</p></InfoCard>);
      const title = screen.getByText('Semantic Title');
      
      expect(title.tagName).toBe('H3');
    });

    it('wraps content in div', () => {
      render(
        <InfoCard title="Title">
          <p>Test content</p>
        </InfoCard>
      );
      
      const content = screen.getByText('Test content');
      expect(content.parentElement.tagName).toBe('DIV');
    });

    it('uses div for card container', () => {
      const { container } = render(
        <InfoCard title="Title">
          <p>Content</p>
        </InfoCard>
      );
      
      expect(container.firstChild.tagName).toBe('DIV');
    });
  });

  describe('Edge Cases', () => {
    it('handles very long title text', () => {
      const longTitle = 'This is a very long title that might wrap to multiple lines in some layouts';
      render(<InfoCard title={longTitle}><p>Content</p></InfoCard>);
      
      expect(screen.getByText(longTitle)).toBeInTheDocument();
    });

    it('handles empty children', () => {
      const { container } = render(<InfoCard title="Empty Content"></InfoCard>);
      const contentArea = container.querySelector('.p-6');
      
      expect(contentArea).toBeInTheDocument();
      expect(contentArea.textContent).toBe('');
    });

    it('handles null children', () => {
      const { container } = render(<InfoCard title="Null Content">{null}</InfoCard>);
      const contentArea = container.querySelector('.p-6');
      
      expect(contentArea).toBeInTheDocument();
    });

    it('handles undefined children', () => {
      const { container } = render(<InfoCard title="Undefined Content">{undefined}</InfoCard>);
      const contentArea = container.querySelector('.p-6');
      
      expect(contentArea).toBeInTheDocument();
    });

    it('handles special characters in title', () => {
      const specialTitle = "Title with & < > ' \" symbols";
      render(<InfoCard title={specialTitle}><p>Content</p></InfoCard>);
      
      expect(screen.getByText(specialTitle)).toBeInTheDocument();
    });

    it('handles numeric title', () => {
      render(<InfoCard title={123}><p>Content</p></InfoCard>);
      
      expect(screen.getByText('123')).toBeInTheDocument();
    });

    it('handles title with line breaks', () => {
      render(<InfoCard title="Line 1\nLine 2"><p>Content</p></InfoCard>);
      
      expect(screen.getByText(/Line 1/)).toBeInTheDocument();
    });

    it('handles complex nested children', () => {
      render(
        <InfoCard title="Complex Content">
          <div>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <p>Paragraph</p>
          </div>
        </InfoCard>
      );
      
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('Paragraph')).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('maintains consistent padding on all screen sizes', () => {
      const { container } = render(
        <InfoCard title="Responsive Card">
          <p>Content</p>
        </InfoCard>
      );
      
      const contentArea = screen.getByText('Content').parentElement;
      expect(contentArea).toHaveClass('p-6');
    });

    it('supports grid layout through custom className', () => {
      const { container } = render(
        <InfoCard title="Grid Item" className="col-span-1 md:col-span-2 lg:col-span-3">
          <p>Content</p>
        </InfoCard>
      );
      const card = container.firstChild;
      
      expect(card).toHaveClass('col-span-1');
      expect(card).toHaveClass('md:col-span-2');
      expect(card).toHaveClass('lg:col-span-3');
    });
  });

  describe('Dynamic Updates', () => {
    it('updates title when prop changes', () => {
      const { rerender } = render(
        <InfoCard title="Original Title">
          <p>Content</p>
        </InfoCard>
      );
      
      expect(screen.getByText('Original Title')).toBeInTheDocument();
      
      rerender(
        <InfoCard title="Updated Title">
          <p>Content</p>
        </InfoCard>
      );
      
      expect(screen.queryByText('Original Title')).not.toBeInTheDocument();
      expect(screen.getByText('Updated Title')).toBeInTheDocument();
    });

    it('updates children when prop changes', () => {
      const { rerender } = render(
        <InfoCard title="Title">
          <p>Original content</p>
        </InfoCard>
      );
      
      expect(screen.getByText('Original content')).toBeInTheDocument();
      
      rerender(
        <InfoCard title="Title">
          <p>Updated content</p>
        </InfoCard>
      );
      
      expect(screen.queryByText('Original content')).not.toBeInTheDocument();
      expect(screen.getByText('Updated content')).toBeInTheDocument();
    });

    it('updates className when prop changes', () => {
      const { container, rerender } = render(
        <InfoCard title="Title" className="original-class">
          <p>Content</p>
        </InfoCard>
      );
      
      let card = container.firstChild;
      expect(card).toHaveClass('original-class');
      
      rerender(
        <InfoCard title="Title" className="updated-class">
          <p>Content</p>
        </InfoCard>
      );
      
      card = container.firstChild;
      expect(card).not.toHaveClass('original-class');
      expect(card).toHaveClass('updated-class');
    });
  });
});
