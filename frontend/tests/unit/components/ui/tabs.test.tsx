import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

describe('Tabs component', () => {
  describe('renders correctly', () => {
    beforeEach(() => {
      render(
        <Tabs defaultValue="tab1">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">Content 1</TabsContent>
          <TabsContent value="tab2">Content 2</TabsContent>
        </Tabs>,
      );
    });
    it('renders Tab 1 content as initially visible', () => {
      expect(screen.getByText('Content 1')).toBeVisible();
    });

    it('does not render Tab 2 content before it is selected', () => {
      expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
    });

    it('hides Tab 1 content after switching to Tab 2', async () => {
      const user = userEvent.setup();
      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));

      expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
    });

    it('shows Tab 2 content after clicking the Tab 2 trigger', async () => {
      const user = userEvent.setup();
      await user.click(screen.getByRole('tab', { name: 'Tab 2' }));

      expect(screen.getByText('Content 2')).toBeVisible();
    });
  });
});
