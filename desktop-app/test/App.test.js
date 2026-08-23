import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../renderer/App.vue';

// Mock child components to simplify integration test
vi.mock('../renderer/components/FileBrowser.vue', () => ({
  default: {
    template: '<div class="file-browser">File Browser</div>',
    methods: { refresh: vi.fn() },
  },
}));

vi.mock('../renderer/components/StatsPanel.vue', () => ({
  default: {
    template: '<div class="stats-panel">Stats Panel</div>',
    props: ['stats'],
  },
}));

describe('App.vue Integration', () => {
  let wrapper;
  const mockApi = {
    fs: {
      selectDirectory: vi.fn(),
      readFile: vi.fn(),
    },
    cli: {
      analyze: vi.fn(),
      generateContext: vi.fn(),
    },
    mcp: {
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
    watcher: {
      start: vi.fn(),
      onFileChange: vi.fn(),
    },
    shortcuts: {
      onOpenProject: vi.fn(),
      onRefresh: vi.fn(),
    },
  };

  beforeEach(() => {
    window.api = mockApi;
    wrapper = mount(App);
  });

  it('renders initial state correctly', () => {
    expect(wrapper.find('.header h1').text()).toContain('Ctxman');
    expect(wrapper.find('.btn-select-project').exists()).toBe(true);
  });

  it('handles project selection', async () => {
    const mockPath = '/test/project';
    mockApi.fs.selectDirectory.mockResolvedValue(mockPath);

    await wrapper.find('.btn-select-project').trigger('click');

    expect(mockApi.fs.selectDirectory).toHaveBeenCalled();
    expect(mockApi.watcher.start).toHaveBeenCalledWith(mockPath);
    expect(wrapper.text()).toContain(mockPath);
  });

  it('switches tabs correctly', async () => {
    const tabs = wrapper.findAll('.nav-btn');

    // Click Resources tab
    await tabs[2].trigger('click');
    expect(wrapper.vm.activeTab).toBe('resources');

    // Click Settings tab
    await tabs[4].trigger('click');
    expect(wrapper.vm.activeTab).toBe('settings');
    expect(wrapper.find('.settings-panel').exists()).toBe(true);
  });

  it('triggers analysis when project is selected', async () => {
    // Setup project first
    wrapper.vm.projectPath = '/test/project';
    await wrapper.vm.$nextTick();

    // Mock analysis result
    mockApi.cli.analyze.mockResolvedValue({
      success: true,
      data: {
        stats: { totalFiles: 5, totalTokens: 100 },
      },
    });

    // Find analyze button
    const analyzeBtn = wrapper.find('.btn-primary');
    await analyzeBtn.trigger('click');

    expect(mockApi.cli.analyze).toHaveBeenCalledWith('/test/project', expect.any(Object));
    // Wait for async analysis
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick(); // extra tick for state update

    expect(wrapper.vm.analysis).not.toBeNull();
    expect(wrapper.vm.stats.filesAnalyzed).toBe(5);
  });
});
