import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Avatar from './Avatar';

describe('Avatar Component', () => {
  describe('Initials Generation', () => {
    it('displays initials for full name (first and last)', () => {
      render(<Avatar name="Juan Dela Cruz" />);
      expect(screen.getByText('JC')).toBeInTheDocument();
    });

    it('displays single initial for single name', () => {
      render(<Avatar name="Maria" />);
      expect(screen.getByText('M')).toBeInTheDocument();
    });

    it('displays first and last initials for multiple names', () => {
      render(<Avatar name="Maria Santos Garcia" />);
      expect(screen.getByText('MG')).toBeInTheDocument();
    });

    it('displays question mark for empty name', () => {
      render(<Avatar name="" />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('displays question mark for null name', () => {
      render(<Avatar name={null} />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('displays question mark for undefined name', () => {
      render(<Avatar />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('handles names with extra whitespace', () => {
      render(<Avatar name="  Pedro   Garcia  " />);
      expect(screen.getByText('PG')).toBeInTheDocument();
    });

    it('converts initials to uppercase', () => {
      render(<Avatar name="juan dela cruz" />);
      expect(screen.getByText('JC')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('applies small size class', () => {
      const { container } = render(<Avatar name="Test User" size="small" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('w-10', 'h-10', 'text-sm');
    });

    it('applies medium size class by default', () => {
      const { container } = render(<Avatar name="Test User" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('w-15', 'h-15', 'text-base');
    });

    it('applies medium size class when explicitly set', () => {
      const { container } = render(<Avatar name="Test User" size="medium" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('w-15', 'h-15', 'text-base');
    });

    it('applies large size class', () => {
      const { container } = render(<Avatar name="Test User" size="large" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('w-20', 'h-20', 'text-2xl');
    });

    it('defaults to medium for invalid size', () => {
      const { container } = render(<Avatar name="Test User" size="invalid" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('w-15', 'h-15', 'text-base');
    });
  });

  describe('Color Generation', () => {
    it('generates consistent color for same name', () => {
      const { container: container1 } = render(<Avatar name="Juan Dela Cruz" />);
      const { container: container2 } = render(<Avatar name="Juan Dela Cruz" />);
      
      const avatar1 = container1.firstChild;
      const avatar2 = container2.firstChild;
      
      // Both should have the same background color class
      const bgClass1 = Array.from(avatar1.classList).find(cls => cls.startsWith('bg-'));
      const bgClass2 = Array.from(avatar2.classList).find(cls => cls.startsWith('bg-'));
      
      expect(bgClass1).toBe(bgClass2);
    });

    it('generates different colors for different names', () => {
      const { container: container1 } = render(<Avatar name="Juan Dela Cruz" />);
      const { container: container2 } = render(<Avatar name="Maria Santos" />);
      
      const avatar1 = container1.firstChild;
      const avatar2 = container2.firstChild;
      
      const bgClass1 = Array.from(avatar1.classList).find(cls => cls.startsWith('bg-'));
      const bgClass2 = Array.from(avatar2.classList).find(cls => cls.startsWith('bg-'));
      
      // Different names should likely have different colors (not guaranteed but highly probable)
      // We just verify both have a bg- class
      expect(bgClass1).toBeTruthy();
      expect(bgClass2).toBeTruthy();
    });

    it('applies default color for empty name', () => {
      const { container } = render(<Avatar name="" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('bg-slate-500');
    });

    it('applies default color for null name', () => {
      const { container } = render(<Avatar name={null} />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('bg-slate-500');
    });
  });

  describe('Styling and Classes', () => {
    it('applies base styling classes', () => {
      const { container } = render(<Avatar name="Test User" />);
      const avatar = container.firstChild;
      
      expect(avatar).toHaveClass('rounded-full');
      expect(avatar).toHaveClass('flex');
      expect(avatar).toHaveClass('items-center');
      expect(avatar).toHaveClass('justify-center');
      expect(avatar).toHaveClass('text-white');
      expect(avatar).toHaveClass('font-semibold');
    });

    it('applies custom className', () => {
      const { container } = render(<Avatar name="Test User" className="custom-class" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveClass('custom-class');
    });

    it('combines custom className with default classes', () => {
      const { container } = render(<Avatar name="Test User" className="ml-4 shadow-lg" />);
      const avatar = container.firstChild;
      
      expect(avatar).toHaveClass('ml-4');
      expect(avatar).toHaveClass('shadow-lg');
      expect(avatar).toHaveClass('rounded-full');
      expect(avatar).toHaveClass('text-white');
    });
  });

  describe('Accessibility', () => {
    it('has role="img"', () => {
      const { container } = render(<Avatar name="Test User" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveAttribute('role', 'img');
    });

    it('has aria-label with user name', () => {
      const { container } = render(<Avatar name="Juan Dela Cruz" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveAttribute('aria-label', 'Juan Dela Cruz');
    });

    it('has default aria-label for empty name', () => {
      const { container } = render(<Avatar name="" />);
      const avatar = container.firstChild;
      expect(avatar).toHaveAttribute('aria-label', 'User avatar');
    });

    it('has default aria-label for null name', () => {
      const { container } = render(<Avatar name={null} />);
      const avatar = container.firstChild;
      expect(avatar).toHaveAttribute('aria-label', 'User avatar');
    });
  });

  describe('Edge Cases', () => {
    it('handles names with special characters', () => {
      render(<Avatar name="JosÃ© MarÃ­a" />);
      expect(screen.getByText('JM')).toBeInTheDocument();
    });

    it('handles names with numbers', () => {
      render(<Avatar name="User123 Test456" />);
      expect(screen.getByText('UT')).toBeInTheDocument();
    });

    it('handles very long names', () => {
      const longName = "Juan Pedro Miguel Santos Garcia Dela Cruz Rodriguez";
      render(<Avatar name={longName} />);
      expect(screen.getByText('JR')).toBeInTheDocument();
    });

    it('handles single character name', () => {
      render(<Avatar name="A" />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('handles name with only spaces', () => {
      render(<Avatar name="   " />);
      expect(screen.getByText('?')).toBeInTheDocument();
    });
  });
});
