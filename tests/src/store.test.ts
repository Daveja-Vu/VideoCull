import useStore, { __test__ } from '../../src/store';
import type { VideoStore } from '../../src/types';
import { makeDuplicateGroup as makeGroup, makeVideo } from '../helpers/videoFactory';

type FilterState = Pick<VideoStore,
  'videos' | 'searchQuery' | 'statusFilter' | 'mediaTypeFilter' | 'minSizeFilter' | 'maxSizeFilter' | 'minDurationFilter' | 'maxDurationFilter' |
  'folderFilter' | 'minRatingFilter' | 'favoritesFilter' | 'incompatibleFilter' | 'duplicateFilter' |
  'sortBy' | 'sortOrder' | 'groupByFolder' | 'folderSortBy' | 'folderSortOrder'
> & Partial<Pick<VideoStore, 'photoSortBy' | 'photoSortOrder'>>;

function makeFilterState(overrides: Partial<FilterState> = {}): FilterState {
  return {
    videos: [],
    searchQuery: '',
    statusFilter: 'all',
    mediaTypeFilter: 'all',
    minSizeFilter: 0,
    maxSizeFilter: null,
    minDurationFilter: 0,
    maxDurationFilter: null,
    folderFilter: null,
    minRatingFilter: 0,
    favoritesFilter: false,
    incompatibleFilter: false,
    duplicateFilter: false,
    sortBy: 'name',
    sortOrder: 'asc',
    groupByFolder: false,
    folderSortBy: 'name',
    folderSortOrder: 'asc',
    ...overrides,
  };
}

describe('store filtering and grouping behavior', () => {
  test('sorts numbered filenames in natural numeric order', () => {
    const videos = [
      makeVideo('ten', { filename: 'file 10.mp4' }),
      makeVideo('two', { filename: 'file 2.mp4' }),
      makeVideo('one', { filename: 'file 1.mp4' }),
    ];

    const filtered = __test__.computeFiltered(makeFilterState({ videos }));

    expect(filtered.map((video) => video.filename)).toEqual([
      'file 1.mp4',
      'file 2.mp4',
      'file 10.mp4',
    ]);
  });

  test('keeps only videos that satisfy the active review filters', () => {
    const videos = [
      makeVideo('a', { sizeBytes: 500, durationSecs: 30, rating: 4, favorite: true, duplicateGroupId: 'g1' }),
      makeVideo('b', { sizeBytes: 300, durationSecs: 20, rating: 2, favorite: false, compatible: false }),
      makeVideo('c', { sizeBytes: 700, durationSecs: 40, rating: 5, favorite: true, duplicateGroupId: 'g2' }),
    ];

    const filtered = __test__.computeFiltered(
      makeFilterState({
        videos,
        minSizeFilter: 400,
        minDurationFilter: 25,
        minRatingFilter: 4,
        favoritesFilter: true,
        duplicateFilter: true,
        sortBy: 'size',
        sortOrder: 'desc',
      })
    );

    expect(filtered.map((video) => video.id)).toEqual(['c', 'a']);
  });

  test('orders grouped results by total folder size before applying item sorting inside each folder', () => {
    const videos = [
      makeVideo('a', { path: 'C:\\one\\a.mp4', sizeBytes: 50 }),
      makeVideo('b', { path: 'C:\\two\\b.mp4', sizeBytes: 500 }),
      makeVideo('c', { path: 'C:\\two\\c.mp4', sizeBytes: 10 }),
    ];

    const filtered = __test__.computeFiltered(
      makeFilterState({
        videos,
        groupByFolder: true,
        folderSortBy: 'size',
        folderSortOrder: 'desc',
        sortBy: 'name',
        sortOrder: 'asc',
      })
    );

    expect(filtered.map((video) => video.id)).toEqual(['b', 'c', 'a']);
  });

  test('orders resolution sort by actual pixel count regardless of orientation', () => {
    const videos = [
      makeVideo('sd', { width: 854, height: 480, path: 'C:\\one\\sd.mp4' }),
      makeVideo('portrait-hd', { width: 1080, height: 1920, path: 'C:\\one\\portrait.mp4' }),
      makeVideo('wide-hd', { width: 1920, height: 1080, path: 'C:\\one\\wide.mp4' }),
      makeVideo('uhd', { width: 3840, height: 2160, path: 'C:\\one\\uhd.mp4' }),
    ];

    const filtered = __test__.computeFiltered(
      makeFilterState({
        videos,
        sortBy: 'resolution',
        sortOrder: 'desc',
      })
    );

    expect(filtered.map((video) => video.id)).toEqual(['uhd', 'portrait-hd', 'wide-hd', 'sd']);
  });

  test('orders resolution sort by the displayed resolution tier instead of rewarding wider low-height files', () => {
    const videos = [
      makeVideo('400p-wide', { width: 640, height: 400, path: 'C:\\one\\400p-wide.mp4' }),
      makeVideo('352p-extra-wide', { width: 720, height: 352, path: 'C:\\one\\352p-extra-wide.mp4' }),
      makeVideo('432p-classic', { width: 576, height: 432, path: 'C:\\one\\432p-classic.mp4' }),
    ];

    const filtered = __test__.computeFiltered(
      makeFilterState({
        videos,
        sortBy: 'resolution',
        sortOrder: 'desc',
      })
    );

    expect(filtered.map((video) => video.id)).toEqual(['432p-classic', '400p-wide', '352p-extra-wide']);
  });

  test('sorts photos by photoSortBy and compares photo resolution by exact pixel count', () => {
    const videos = [
      makeVideo('square-5mp', { width: 2400, height: 2400, path: 'C:\\one\\a.jpg', filename: 'a.jpg' }),
      makeVideo('wide-2mp', { width: 2560, height: 1000, path: 'C:\\one\\b.png', filename: 'b.png' }),
      makeVideo('clip', { width: 1920, height: 1080, path: 'C:\\one\\c.mp4', filename: 'c.mp4' }),
    ];

    const filtered = __test__.computeFiltered(
      makeFilterState({
        videos,
        sortBy: 'name',
        sortOrder: 'asc',
        photoSortBy: 'resolution',
        photoSortOrder: 'desc',
      })
    );

    expect(filtered.map((video) => video.id)).toEqual(['clip', 'square-5mp', 'wide-2mp']);
  });
});

describe('duplicate pair normalization', () => {
  test('stores a valid duplicate pair key in stable lowercase order', () => {
    expect(__test__.normalizeDuplicatePairKey('ABCDEFABCDEFABCD|0011223344556677')).toBe('0011223344556677|abcdefabcdefabcd');
  });

  test('rejects malformed duplicate pair keys', () => {
    expect(__test__.normalizeDuplicatePairKey('bad')).toBeNull();
  });

  test('rejects duplicate pair keys that point to the same video twice', () => {
    expect(__test__.normalizeDuplicatePairKey('0011223344556677|0011223344556677')).toBeNull();
  });
});

describe('duplicate group annotations', () => {
  test('marks videos inside a duplicate group with their group metadata', () => {
    const videos = [
      makeVideo('a', { duplicateGroupId: 'old', duplicateSuggestedKeeper: true }),
      makeVideo('b'),
      makeVideo('c', { duplicateGroupId: 'stale' }),
    ];
    const groups = [makeGroup({ videoIds: ['a', 'b'], suggestedKeeperId: 'b', exactVideoIds: ['a'] })];

    const next = __test__.applyDuplicateGroupsToVideos(videos, groups);

    expect(next[0]).toMatchObject({
      duplicateGroupId: 'group-1',
      duplicateSuggestedKeeper: false,
      duplicateExact: true,
      duplicateGroupSize: 2,
    });
    expect(next[1]).toMatchObject({
      duplicateGroupId: 'group-1',
      duplicateSuggestedKeeper: true,
      duplicateMatchType: 'visual',
    });
  });

  test('clears stale duplicate metadata from videos that no longer belong to a group', () => {
    const videos = [
      makeVideo('a', { duplicateGroupId: 'old' }),
      makeVideo('b', { duplicateGroupId: 'stale', duplicateSuggestedKeeper: true }),
    ];

    const next = __test__.applyDuplicateGroupsToVideos(videos, []);

    expect(next[0]).toMatchObject({
      duplicateGroupId: null,
      duplicateSuggestedKeeper: false,
      duplicateGroupSize: 0,
    });
    expect(next[1]).toMatchObject({
      duplicateGroupId: null,
      duplicateSuggestedKeeper: false,
      duplicateGroupSize: 0,
    });
  });
});

describe('keeper suggestions', () => {
  test('picks the highest-ranked video when no manual override exists', () => {
    const videos = [
      makeVideo('a', { path: 'C:\\z.mp4', width: 1280, height: 720, videoBitrate: 2000, durationSecs: 30, fps: 30, sizeBytes: 100 }),
      makeVideo('b', { path: 'C:\\a.mp4', width: 1920, height: 1080, videoBitrate: 4000, durationSecs: 60, fps: 60, sizeBytes: 150 }),
    ];

    const groups = __test__.applyKeeperOrderToGroups([makeGroup({ videoIds: ['a', 'b'] })], videos, ['resolution', 'size']);
    expect(groups[0]?.suggestedKeeperId).toBe('b');
  });

  test('uses bitrate when displayed resolution tiers match', () => {
    const videos = [
      makeVideo('more-pixels', { path: 'C:\\more-pixels.mp4', width: 1920, height: 1080, videoBitrate: 3586000 }),
      makeVideo('higher-bitrate', { path: 'C:\\higher-bitrate.mp4', width: 1920, height: 800, videoBitrate: 6008000 }),
      makeVideo('lower-tier', { path: 'C:\\lower-tier.mp4', width: 1280, height: 720, videoBitrate: 12000000 }),
    ];

    const groups = __test__.applyKeeperOrderToGroups(
      [makeGroup({ videoIds: ['more-pixels', 'higher-bitrate', 'lower-tier'] })],
      videos,
      ['resolution', 'videoBitrate']
    );

    expect(groups[0]?.suggestedKeeperId).toBe('higher-bitrate');
  });

  test('prefers the higher-ranked codec only when the codec rule comes first', () => {
    const videos = [
      makeVideo('h264', { path: 'C:\\h264.mp4', videoCodec: 'h264', videoBitrate: 10000000 }),
      makeVideo('hevc', { path: 'C:\\hevc.mp4', videoCodec: 'hevc', videoBitrate: 6000000 }),
    ];
    const group = [makeGroup({ videoIds: ['h264', 'hevc'] })];
    const codecOrder = ['av1', 'hevc', 'vp9', 'h264'];

    expect(__test__.applyKeeperOrderToGroups(group, videos, ['codec', 'videoBitrate'], codecOrder)[0]?.suggestedKeeperId).toBe('hevc');
    expect(__test__.applyKeeperOrderToGroups(group, videos, ['videoBitrate', 'codec'], codecOrder)[0]?.suggestedKeeperId).toBe('h264');
  });

  test('counts alternative ffprobe codec names as their family', () => {
    const videos = [
      makeVideo('wmv', { path: 'C:\\wmv.wmv', videoCodec: 'wmv3' }),
      makeVideo('mpeg4', { path: 'C:\\mpeg4.avi', videoCodec: 'mpeg4' }),
      makeVideo('h265', { path: 'C:\\h265.mkv', videoCodec: 'h265' }),
    ];
    const codecOrder = ['av1', 'hevc', 'vp9', 'h264', 'vp8', 'mpeg4', 'mpeg2video', 'vc1'];
    const keeper = (ids: string[]) => __test__.applyKeeperOrderToGroups([makeGroup({ videoIds: ids })], videos, ['codec'], codecOrder)[0]?.suggestedKeeperId;

    expect(keeper(['wmv', 'mpeg4'])).toBe('mpeg4');
    expect(keeper(['mpeg4', 'h265'])).toBe('h265');
  });

  test('does not assign a resolution tier to incomplete metadata', () => {
    const videos = [
      makeVideo('incomplete', { path: 'C:\\incomplete.mp4', width: 1920, height: null, videoBitrate: 6008000 }),
      makeVideo('complete', { path: 'C:\\complete.mp4', width: 1280, height: 720, videoBitrate: 3586000 }),
    ];

    const groups = __test__.applyKeeperOrderToGroups(
      [makeGroup({ videoIds: ['incomplete', 'complete'] })],
      videos,
      ['resolution', 'videoBitrate']
    );

    expect(groups[0]?.suggestedKeeperId).toBe('complete');
  });

  test('keeps a valid manual keeper override instead of replacing it with the automatic ranking', () => {
    const videos = [
      makeVideo('a', { path: 'C:\\z.mp4', width: 1280, height: 720, videoBitrate: 2000, durationSecs: 30, fps: 30, sizeBytes: 100 }),
      makeVideo('b', { path: 'C:\\a.mp4', width: 1920, height: 1080, videoBitrate: 4000, durationSecs: 60, fps: 60, sizeBytes: 150 }),
      makeVideo('c', { path: 'C:\\c.mp4', width: 640, height: 480, videoBitrate: 1000, durationSecs: 20, fps: 24, sizeBytes: 80 }),
    ];

    const groups = __test__.applyKeeperOrderToGroups(
      [makeGroup({ videoIds: ['a', 'b'], manualSuggestedKeeperId: 'a', suggestedKeeperId: 'b' }), makeGroup({ id: 'group-2', videoIds: ['b', 'c'], suggestedKeeperId: 'b', reason: 'Other' })],
      videos,
      ['resolution', 'size']
    );

    expect(groups[0]?.suggestedKeeperId).toBe('a');
    expect(groups[0]?.manualSuggestedKeeperId).toBe('a');
    expect(groups[1]?.suggestedKeeperId).toBe('b');
  });
});

describe('review scope behavior', () => {
  const videos = [makeVideo('a'), makeVideo('b'), makeVideo('c')];
  const filteredVideos = [videos[1]!, videos[2]!];

  test('honors an explicit review scope when the current video is still inside it', () => {
    expect(__test__.getReviewScopeIdsForVideo('b', ['b', 'a', 'b'], videos, filteredVideos)).toEqual(['b', 'a']);
  });

  test('falls back to the filtered view when the explicit scope no longer contains the current video', () => {
    expect(__test__.getReviewScopeIdsForVideo('c', ['a'], videos, filteredVideos)).toEqual(['b', 'c']);
  });

  test('falls back to all loaded videos when neither the explicit nor filtered scope contains the current video', () => {
    expect(__test__.getReviewScopeIdsForVideo('a', ['x'], videos, filteredVideos)).toEqual(['a', 'b', 'c']);
  });
});

describe('directory identity', () => {
  test('keeps only the first occurrence of each normalized directory path', () => {
    expect(__test__.uniqueDirectories([
      'C:\\Media',
      'c:/media/',
      'D:\\Clips',
      'D:\\Clips\\',
    ])).toEqual(['C:\\Media', 'D:\\Clips']);
  });

  test('keeps folders that differ only in letter case apart on Linux', () => {
    vi.stubGlobal('window', { electronAPI: { platform: 'linux' } });
    try {
      expect(__test__.uniqueDirectories(['/media/LinuxCase/Project', '/media/LinuxCase/project']))
        .toEqual(['/media/LinuxCase/Project', '/media/LinuxCase/project']);
      expect(__test__.isPathInsideRoot('/media/LinuxCase/project/a.mp4', '/media/LinuxCase/Project')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

test('the title bar path filter keeps a folder and everything below it, not folders that only start alike', () => {
  const videos = [
    makeVideo('top', {}, 'P:\\AI'),
    makeVideo('deep', {}, 'P:\\AI\\Traingon\\Holiday'),
    makeVideo('alike', {}, 'P:\\AI Extra'),
    makeVideo('other', {}, 'P:\\Downloads'),
  ];
  const filtered = __test__.computeFiltered(makeFilterState({ videos, folderFilter: { path: 'P:\\AI', includeSubfolders: true } }));
  expect(filtered.map((video) => video.id).sort()).toEqual(['deep', 'top']);
  // A drive root is written with its separator.
  expect(__test__.computeFiltered(makeFilterState({ videos, folderFilter: { path: 'P:\\', includeSubfolders: true } }))).toHaveLength(4);
  // Without subfolders, only the folder's own videos.
  const exact = __test__.computeFiltered(makeFilterState({ videos, folderFilter: { path: 'P:\\AI', includeSubfolders: false } }));
  expect(exact.map((video) => video.id)).toEqual(['top']);
  // Letter case and a drive root's trailing separator do not matter either.
  expect(__test__.computeFiltered(makeFilterState({ videos, folderFilter: { path: 'p:\\ai', includeSubfolders: false } }))
    .map((video) => video.id)).toEqual(['top']);
  const onRoot = [makeVideo('root', {}, 'P:'), ...videos];
  expect(__test__.computeFiltered(makeFilterState({ videos: onRoot, folderFilter: { path: 'P:\\', includeSubfolders: false } }))
    .map((video) => video.id)).toEqual(['root']);
});

test('mediaTypeFilter filters videos and photos accurately', () => {
  const items = [
    makeVideo('vid1', { filename: 'clip.mp4', path: '/media/clip.mp4' }),
    makeVideo('img1', { filename: 'portrait.jpg', path: '/media/portrait.jpg', durationSecs: 0 }),
    makeVideo('img2', { filename: 'pet.heic', path: '/media/pet.heic', durationSecs: 0 }),
  ];

  expect(__test__.computeFiltered(makeFilterState({ videos: items, mediaTypeFilter: 'all' })).map((v) => v.id))
    .toEqual(['vid1', 'img2', 'img1']);
  expect(__test__.computeFiltered(makeFilterState({ videos: items, mediaTypeFilter: 'photos' })).map((v) => v.id))
    .toEqual(['img2', 'img1']);
  expect(__test__.computeFiltered(makeFilterState({ videos: items, mediaTypeFilter: 'videos' })).map((v) => v.id))
    .toEqual(['vid1']);
});

test('moveVideosToHotkeyFolder moves active review item and undo restores it', async () => {
  const moveCalls: Array<{ filePaths: string[]; targetFolder: string }> = [];
  const restoreCalls: Array<Array<{ fromPath: string; toPath: string }>> = [];

  vi.stubGlobal('window', {
    electronAPI: {
      platform: 'darwin',
      moveVideosToFolder: async (filePaths: string[], targetFolder: string) => {
        moveCalls.push({ filePaths, targetFolder });
        return filePaths.map((p) => ({
          path: p,
          newPath: `${targetFolder}/${p.split('/').pop()}`,
          newId: 'moved-id-1',
          success: true,
        }));
      },
      restoreMovedVideos: async (moves: Array<{ fromPath: string; toPath: string }>) => {
        restoreCalls.push(moves);
        return moves.map((m) => ({ path: m.toPath, fromPath: m.fromPath, success: true }));
      },
      saveConfig: async () => true,
    },
  });

  try {
    const img1 = makeVideo('img1', { filename: 'portrait.jpg', path: '/session/portrait.jpg', durationSecs: 0 });
    const img2 = makeVideo('img2', { filename: 'pet.jpg', path: '/session/pet.jpg', durationSecs: 0 });
    useStore.setState({
      directory: '/session',
      directories: ['/session'],
      includeSubfolders: false,
      videos: [img1, img2],
      filteredVideos: [img1, img2],
      reviewMode: true,
      reviewIndex: 0,
      reviewScopeIds: ['img1', 'img2'],
      undoStack: [],
      settings: {
        ...useStore.getState().settings,
        folderHotkeys: {
          '1': { folderPath: '/Portraits', label: 'Portraits' },
        },
      },
    });

    const moved = await useStore.getState().moveVideosToHotkeyFolder('1', ['img1']);
    expect(moved).toBe(true);
    expect(moveCalls).toEqual([{ filePaths: ['/session/portrait.jpg'], targetFolder: '/Portraits' }]);
    expect(useStore.getState().videos.map((v) => v.id)).toEqual(['img2']);
    expect(useStore.getState().reviewScopeIds).toEqual(['img2']);
    expect(useStore.getState().reviewIndex).toBe(0);

    useStore.getState().undo();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(restoreCalls).toEqual([[{ fromPath: '/session/portrait.jpg', toPath: '/Portraits/portrait.jpg' }]]);
    expect(useStore.getState().videos.map((v) => v.id).sort()).toEqual(['img1', 'img2']);
    expect(useStore.getState().reviewScopeIds).toEqual(['img1', 'img2']);
  } finally {
    vi.unstubAllGlobals();
  }
});

test('setMediaMode switches between videos only, photos only, and both', () => {
  const vid = makeVideo('vid1', { filename: 'clip.mp4', path: '/session/clip.mp4' });
  const img = makeVideo('img1', { filename: 'photo.jpg', path: '/session/photo.jpg', durationSecs: 0 });
  useStore.setState({
    mediaMode: 'both',
    mediaTypeFilter: 'all',
    videos: [vid, img],
    filteredVideos: [vid, img],
  });

  useStore.getState().setMediaMode('videos');
  expect(useStore.getState().mediaMode).toBe('videos');
  expect(useStore.getState().filteredVideos.map((v) => v.id)).toEqual(['vid1']);

  useStore.getState().setMediaMode('photos');
  expect(useStore.getState().mediaMode).toBe('photos');
  expect(useStore.getState().filteredVideos.map((v) => v.id)).toEqual(['img1']);

  useStore.getState().setMediaMode('both');
  expect(useStore.getState().mediaMode).toBe('both');
  expect(useStore.getState().filteredVideos.map((v) => v.id)).toEqual(['vid1', 'img1']);
});
