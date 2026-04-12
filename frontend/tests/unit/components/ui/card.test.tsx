import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

describe('Card components', () => {
  describe('renders correctly', () => {
    beforeEach(() => {
      render(
        <Card data-testid="card">
          <CardHeader data-testid="card-header">
            <CardTitle>Title</CardTitle>
            <CardDescription>Description</CardDescription>
          </CardHeader>
          <CardContent data-testid="card-content">Content</CardContent>
          <CardFooter data-testid="card-footer">Footer</CardFooter>
        </Card>,
      );
    });

    it('renders the card container', () => {
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('renders the card header', () => {
      expect(screen.getByTestId('card-header')).toBeInTheDocument();
    });

    it('renders the card title', () => {
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('renders the card description', () => {
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('renders the card content', () => {
      expect(screen.getByTestId('card-content')).toHaveTextContent('Content');
    });

    it('renders the card footer', () => {
      expect(screen.getByTestId('card-footer')).toHaveTextContent('Footer');
    });
  });

  it('applies custom classes successfully', () => {
    render(<Card className="custom-card-class">Content</Card>);
    expect(screen.getByText('Content')).toHaveClass('custom-card-class');
  });
});
