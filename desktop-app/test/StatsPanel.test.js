import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import StatsPanel from '../renderer/components/StatsPanel.vue';

describe('StatsPanel.vue', () => {
  const mockStats = {
    totalFiles: 10,
    totalTokens: 5000,
    totalLines: 1000,
    files: [],
  };

  it('renders stats correctly', () => {
    const wrapper = mount(StatsPanel, {
      props: {
        stats: mockStats,
      },
    });

    expect(wrapper.text()).toContain('10');
    expect(wrapper.text()).toContain('5,000'); // Formatted number
    expect(wrapper.text()).toContain('1,000');
  });

  it('disables export button when no stats', () => {
    const wrapper = mount(StatsPanel, {
      props: {
        stats: null,
      },
    });

    const button = wrapper.find('.btn-export');
    expect(button.element.disabled).toBe(true);
  });

  it('calls saveFile API on export', async () => {
    // Mock window.api
    window.api = {
      fs: {
        saveFile: vi.fn().mockResolvedValue({ success: true, filePath: '/tmp/report.json' }),
      },
    };

    const wrapper = mount(StatsPanel, {
      props: {
        stats: mockStats,
      },
    });

    await wrapper.find('.btn-export').trigger('click');
    expect(window.api.fs.saveFile).toHaveBeenCalled();
  });
});
