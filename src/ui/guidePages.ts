// The pictures on the "How it works" cards (see src/ui/guide.ts): each page
// shows bits of the real screen, cut out of a screenshot and stacked, with
// the rest dimmed and the things to look at ringed.
//
// Everything is in screen pixels of the 390px wide phone screen the
// screenshots were taken on. `segs` are the strips of it to show (top to
// bottom, from x 8 to 382), `holes` the boxes to ring, and `tap` or `hold`
// where the finger goes. The strips are saved one under the other in
// public/guides/<guide>-<page>.webp, at twice the size.
// The words are in STRINGS.guides, page for page.

export type Rect = [number, number, number, number]; // x, y, width, height

export interface GuidePicture {
  segs: [number, number][];
  holes: Rect[];
  tap?: [number, number];
  hold?: [number, number];
}

export const GUIDE_PICTURES: Record<string, GuidePicture[]> = {
  basics: [
    { segs: [[163, 433]], holes: [[16, 297, 358, 136]] },
    { segs: [[463, 660], [768, 836]], holes: [[30, 533, 330, 52], [16, 776, 358, 52]], tap: [190, 552] },
    { segs: [[236, 433], [768, 836]], holes: [[30, 399, 330, 22], [318, 776, 56, 52]], tap: [336, 790] },
    { segs: [[100, 236], [266, 395]], holes: [[128, 106, 134, 116], [97, 335, 196, 58]] },
  ],
  shop: [
    { segs: [[460, 730]], holes: [[291, 484, 59, 22], [278, 657, 72, 28]], tap: [338, 668] },
    { segs: [[85, 215], [460, 595]], holes: [[118, 106, 152, 112], [278, 533, 72, 28]], hold: [190, 165] },
  ],
  garden: [
    { segs: [[290, 430], [650, 775]], holes: [[31, 312, 106, 30], [30, 658, 330, 52]], tap: [300, 690] },
    { segs: [[283, 480], [768, 836]], holes: [[16, 445, 358, 28], [116, 779, 123, 52]], hold: [205, 790] },
    { segs: [[150, 276], [346, 412], [768, 836]], holes: [[302, 152, 64, 121], [116, 386, 160, 19], [116, 776, 258, 52]], tap: [318, 788] },
  ],
  fishing: [
    { segs: [[240, 437], [768, 836]], holes: [[116, 776, 258, 52]], tap: [318, 788] },
    { segs: [[96, 293], [768, 836]], holes: [[310, 114, 34, 62], [113, 775, 263, 53]], tap: [325, 788] },
    { segs: [[240, 437], [768, 836]], holes: [[22, 382, 346, 45], [116, 779, 258, 52]], hold: [290, 790] },
  ],
  cooking: [
    { segs: [[300, 412], [560, 713]], holes: [[26, 336, 63, 63], [282, 327, 82, 82], [299, 572, 61, 61]], tap: [318, 592] },
    { segs: [[470, 667], [768, 836]], holes: [[30, 496, 330, 52], [30, 554, 330, 52], [16, 776, 358, 52]], tap: [300, 790] },
    { segs: [[236, 433], [768, 836]], holes: [[96, 300, 198, 112]] },
    { segs: [[300, 412], [560, 713]], holes: [[26, 336, 148, 63], [280, 329, 86, 77]] },
  ],
  delivery: [
    { segs: [[10, 280]], holes: [[312, 17, 57, 57]], tap: [326, 58] },
    { segs: [[243, 440], [768, 836]], holes: [[26, 324, 338, 101], [105, 776, 269, 52]], tap: [228, 398] },
    { segs: [[175, 445]], holes: [[164, 303, 62, 28], [284, 304, 80, 26]] },
  ],
  craving: [
    { segs: [[10, 280]], holes: [[216, 24, 52, 58]] },
    { segs: [[463, 660], [768, 836]], holes: [[30, 533, 330, 52]], tap: [150, 552] },
  ],
  journeys: [
    { segs: [[205, 475]], holes: [[26, 306, 338, 40], [26, 352, 338, 40], [26, 398, 338, 40]], tap: [270, 368] },
    { segs: [[259, 456], [768, 836]], holes: [[26, 338, 338, 52], [26, 396, 338, 52], [98, 776, 276, 52]], tap: [300, 790] },
    { segs: [[355, 467], [676, 756], [768, 836]], holes: [[37, 383, 86, 81], [104, 686, 72, 62], [98, 776, 276, 52]], tap: [160, 716] },
    { segs: [[150, 420]], holes: [[32, 355, 326, 49]], tap: [300, 370] },
  ],
  meet: [
    { segs: [[236, 433], [768, 836]], holes: [[16, 297, 358, 136], [231, 776, 143, 52]], tap: [350, 792] },
    { segs: [[300, 350], [505, 647], [768, 836]], holes: [[278, 323, 84, 20], [30, 516, 330, 52], [16, 776, 358, 52]], tap: [200, 532] },
    { segs: [[150, 420]], holes: [[142, 372, 106, 40]], tap: [232, 388] },
    { segs: [[460, 730]], holes: [[195, 524, 85, 29], [256, 612, 72, 36]], tap: [322, 634] },
  ],
  family: [
    { segs: [[150, 420]], holes: [[278, 316, 84, 20], [26, 374, 337, 38]], tap: [335, 390] },
    { segs: [[460, 730]], holes: [[111, 524, 168, 29], [30, 603, 330, 88]] },
  ],
  skills: [
    { segs: [[460, 730]], holes: [[30, 521, 330, 59], [30, 590, 330, 33]] },
    { segs: [[566, 836]], holes: [[41, 641, 76, 91]], tap: [112, 650] },
  ],
  sick: [
    { segs: [[130, 400]], holes: [[32, 336, 326, 49]], tap: [300, 352] },
    { segs: [[146, 416]], holes: [[32, 355, 159, 49]], tap: [168, 374] },
  ],
  collection: [
    { segs: [[460, 730]], holes: [[30, 527, 330, 25], [30, 558, 44, 44], [30, 666, 330, 25]] },
  ],
};

