// Authored inspection cameras in metres, not historical engineering dimensions.
// Habitat axis +Z = north; XY is the rotating wheel plane.
export const exteriorViews=Object.freeze([
 {id:'overview',name:'Whole station',position:[-2400,-2700,2800],target:[0,0,800]},
 {id:'spokes',name:'Spokes and hub',position:[1120,-1050,670],target:[0,0,0]},
 {id:'docking',name:'North Pole docking',position:[180,-210,215],target:[0,0,65]},
 {id:'fabrication',name:'Fabrication sphere and furnace',position:[-370,-320,-350],target:[-50,0,-160]},
 {id:'solar',name:'Solar cells and secondary mirrors',position:[700,-800,930],target:[0,0,115]},
 {id:'mirror',name:'Main sunlight mirror',position:[-1850,-1650,3200],target:[0,0,1500]},
 {id:'radiator',name:'Habitat radiator',position:[1150,-1600,-1000],target:[0,-85,-418]},
 {id:'shield',name:'Shell, windows and radiation shield',position:[650,-100,150],target:[815,0,0]},
 {id:'industry',name:'Remote extraction plant · 10 km south',position:[210,-230,-9740],target:[0,0,-10000]},
]);
export function findExteriorView(id){const view=exteriorViews.find(v=>v.id===id);if(!view)throw new RangeError('Unknown exterior view '+id);return view;}
