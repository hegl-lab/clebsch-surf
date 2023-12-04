// THREEi.js ( rev 113.0 )

/**
 * @author hofk / https://threejs.hofk.de/
*/

(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.THREEi = global.THREEi || {})));
}(this, (function (exports) {

'use strict';

var g;	// THREE.BufferGeometry

//#################################################################################################

// Algorithm based on (simplified for sphere with holes)
// de: https://www2.mathematik.tu-darmstadt.de/~ehartmann/cdg0/cdg0n.pdf
// en: https://www2.mathematik.tu-darmstadt.de/~ehartmann/cdgen0104.pdf
//
//       Each single section between ..... name ...... can be deleted.
//

// ............................ Sphere with Holes (Triangulation) .................................

function createSphereWithHoles( arg1, arg2 ) {
	
	g = this;  //  THREE.BufferGeometry() - geometry object from three.js
		
	if( typeof arg1 === 'number' )  { // variant detail, holes are optional,
        
		// Variant with less effort in the algorithm! Other angle calculation too.
			 
		// radius = 1 is fixed - use three.js .scale
		g.detail = arg1; // count of triangles for half a great circle 
		g.holes = arg2 !== undefined ? arg2 : []; // optional
		
		g.buildSphereWithHoles = buildSphereWithHoles;		
		g.buildSphereWithHoles( );
		
	} else  { // variant parameters object { d: div4: holes: } all elements optional
		
		g.d = arg1.d !== undefined ? arg1.d : 2 * Math.sin( Math.PI / 24 ); // to g.div4 default
		g.div4 = arg1.div4 !== undefined ? arg1.div4 : 6; // 6 * 4 = 24 great circle divisions
		g.holes = arg1.holes !== undefined ? arg1.holes : [];
		
		g.detail = g.div4 * 4; // division of the great circle 
		g.radius = g.d / Math.sin( Math.PI / g.detail ) / 2; // sphere radius, for external use as well
		
		g.buildSphereWithHolesObj = buildSphereWithHolesObj;
		g.buildSphereWithHolesObj( );
    }
    
	/* 	holes, example:
		holes: [
			// circular hole, 3 elements: [ theta, phi, div4Hole ], div4Hole <= div4	
			[ 1.82,  0.41, 12 ],
			// not centered hole to conect a cylinder,
			// 5 elements: [ theta, phi, div4Hole,'exc', exc%, ], exc% as % of radius, div4Hole <= div4
			[  0, 0.77, 18, 'exc', 5.8],
			[  0, -1.4, 16, 'exc', 73.2933 ], // 100 is identical, exc is limited 
			// points hole,: array of points theta, phi, ...  (last point is connected to first)
			[ 0,0,  0.5,-0.8,  0.25,-0.27,  0.4,0.3,  0.3,0.72 ]
		]
	*/
	
}

function buildSphereWithHolesObj( ) {
	
	const dd = g.d * g.d;
	
	const squareLength = ( x,y,z ) => (  x*x + y*y + z*z );
	const length = ( x, y, z ) => ( Math.sqrt( x * x + y * y + z * z ) );
	const prevFront = ( i ) => ( i !== 0 ? i - 1 : front.length - 1 );
	const nextFront  = ( i ) => ( i !== front.length - 1 ? i + 1 : 0 );
	const determinant = ( xa,ya,za, xb,yb,zb, xc,yc,zc ) => ( xa*yb*zc + ya*zb*xc + za*xb*yc - za*yb*xc - xa*zb*yc - ya*xb*zc );
	
	let m; // index of the current front point
	let n; // number of new points
	let nT; // number of new triangles
	let nIns; // number of new points (after union or split)
	let dAng; // partial angle
	let len, d1, d2, d12; // lengths
	let iSplit, jSplit; // split front indices  
	let iUnite, jUnite, fUnite; // unite front indices, front number (to unite) 
	
	// points and vectors:
	let x, y, z, xp, yp, zp; // coordinates point and actual point p
	let x1, y1, z1, x2, y2, z2; // previous and next point to p in front
	let xn, yn, zn; // normal, gradient (sphere: normalized point)
	let xt1, yt1, zt1, xt2, yt2, zt2; // tangents
	let xs1, ys1, xs2, ys2; // p in tangential system (only x, y required)
	let xc, yc, zc; // actual point as center point for new points
	
	//  preparation
	
	const faceCount = g.detail * g.detail * 8 ;
	const posCount  = g.detail * g.detail * 6 ;
	
	g.indices = new Uint32Array( faceCount * 3 );
	g.positions = new Float32Array( posCount * 3 );
	//g.normals = new Float32Array( posCount * 3 );
	
	g.setIndex( new THREE.BufferAttribute( g.indices, 1 ) );
	g.addAttribute( 'position', new THREE.BufferAttribute( g.positions, 3 ) );
	
	let posIdx = 0;
	let indIdx = 0;
	let frontPosIdx, unionIdxA, unionIdxB, splitIdx;
	
	let front = []; // active front // front[ i ]: object { idx: 0, ang: 0 }
	let partFront = []; // separated part of the active front (to split)
	let insertFront = []; // new front points to insert into active front
	let fronts = []; // all fronts
	let partBounds = []; // bounding box of partFront [ xmin, ymin, zmin, xmax, ymax, zmax ]
	let boundings = []; // fronts bounding boxes
	let smallAngles = []; // new angles < 1.5
	
	let frontNo, frontStock;
	let unite = false;
	let split = false;
	
	frontNo = 0; // active front number
	frontStock = 0; // number of fronts still to be processed
	
	// define holes fronts
	
	if ( g.holes.length === 0 ) {
		
		makeFirstTriangle( );
		
	} else {
	
		g.circles = []; // array of arrays [ xc, yc, zc, rHole, div4Hole ], values for external use
		
		for ( let i = 0; i < g.holes.length; i ++ ) {
			
			if ( g.holes[ i ].length === 3 ) {
				
				makeCircularHole( i );  // [ theta, phi, div4Hole ]
				
			} else {
				
				makePointsHole( i ); // points: [ theta, phi, ... ]
				
			}
			
		}
		
	}
	
	frontNo = 0;
	front = fronts[ frontNo ];
	
	//////////////// DEBUG triangles //////////////////////////////////////
	// let stp = 0; 
	///////////////////////////////////////////////////////////////////////
	
	// ------ triangulation cycle -------------
	
	while ( frontStock > 0 ) {
		
		if ( !unite && !split ) { // triangulation on the front
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				if( front[ i ].ang === 0 ) calculateFrontAngle( i ); // is to be recalculated (angle was set to zero)
				
			}
			
			m = getMinimalAngleIndex( ); // front angle
			makeNewTriangles( m );
			
			if ( front.length > 9 && smallAngles.length === 0 ) {
				
				checkDistancesToUnite( m );
				checkDistancesToSplit( m );
				
			}
			
			if ( front.length === 3 ) {
				
				makeLastTriangle( ); // last triangle closes the front
				chooseNextFront( ); // if aviable
				
			}
			
		} else { // unite the active front to another front or split the active front
			
			if ( unite ) {
				
				uniteFront(  m, iUnite, fUnite, jUnite );
				trianglesAtUnionPoints( );
				unite = false;
				
			} else if ( split ) {
				
				splitFront( iSplit, jSplit );
				trianglesAtSplitPoints( );
				split = false;
				
			}
			
		}
		
	}
	
	// .....  detail functions .....
	
	function makeFirstTriangle ( ) {
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		storePoint( 0, 0 ); // ( theta, phi )
		storePoint( Math.PI / 2 / g.div4, -Math.PI / 6 );
		storePoint( Math.PI / 2 / g.div4,  Math.PI / 6 );
		
		g.indices[ 0 ] = 0;
		g.indices[ 1 ] = 1; 
		g.indices[ 2 ] = 2;
		
		indIdx += 3;
		
		///////////////  DEBUG triangles  //////////////////////
	 	//  stp ++;
		////////////////////////////////////////////////////////
		
		fronts[ frontNo ].push( { idx: 0, ang: 0 }, { idx: 1, ang: 0 }, { idx: 2, ang: 0 } );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function makePointsHole( i ) {
	
		let  theta, phi, count, xmin, ymin, zmin, xmax, ymax, zmax, xv2, yv2, zv2;
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		theta = g.holes[ i ][ 0 ];
		phi = g.holes[ i ][ 1 ]; 
		
		x1 = g.radius * Math.sin( theta ) * Math.cos( phi );
		y1 = g.radius * Math.cos( theta );
		z1 = -g.radius * Math.sin( theta ) * Math.sin( phi );
		
		for ( let j = 1; j < g.holes[ i ].length / 2 + 1; j ++ ) {
		
			g.positions[ posIdx     ] = x1;
			g.positions[ posIdx + 1 ] = y1;
			g.positions[ posIdx + 2 ] = z1;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x1 < xmin ? x1 : xmin;
			ymin = y1 < ymin ? y1 : ymin;
			zmin = z1 < zmin ? z1 : zmin;
			
			xmax = x1 > xmax ? x1 : xmax;
			ymax = y1 > ymax ? y1 : ymax;
			zmax = z1 > zmax ? z1 : zmax;
			
			posIdx += 3;
			
			theta = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 : 0 ]; // 0 => connect to start
			phi = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 + 1 : 1 ]; // 1 => connect to start
			
			x2 = g.radius *  Math.sin( theta ) * Math.cos( phi );
			y2 = g.radius *  Math.cos( theta );
			z2 = -g.radius * Math.sin( theta ) * Math.sin( phi );
			
			xv2 = x2 - x1;
			yv2 = y2 - y1;
			zv2 = z2 - z1;
			
			len = length( xv2, yv2, zv2 );
			
			if ( len > g.d ) {
				
				count = Math.ceil( len / g.d );
				
				for ( let k = 1; k < count; k ++ ) {
					
					x = x1 + k * xv2 / count;
					y = y1 + k * yv2 / count;
					z = z1 + k * zv2 / count;
					
					len = length( x, y, z );   // to bring the point to the surface (g.radius * ..)
					
					g.positions[ posIdx     ] = g.radius * x / len;
					g.positions[ posIdx + 1 ] = g.radius * y / len;
					g.positions[ posIdx + 2 ] = g.radius * z / len;
					
					fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
					
					xmin = x < xmin ? x : xmin;
					ymin = y < ymin ? y : ymin;
					zmin = z < zmin ? z : zmin;
					
					xmax = x > xmax ? x : xmax;
					ymax = y > ymax ? y : ymax;
					zmax = z > zmax ? z : zmax;
					
					posIdx += 3;
					
				}
				
			}
			
			x1 = x2;
			y1 = y2;
			z1 = z2;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function makeCircularHole( i ) {
		
		let xa, ya, za, xb, yb; // for rotation around z, y
		
		const theta = g.holes[ i ][ 0 ];
		const phi = g.holes[ i ][ 1 ];
		const div4Hole = g.holes[ i ][ 2 ];
		const countH = div4Hole * 4;
		
		let xmin, ymin, zmin, xmax, ymax, zmax;
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		const rHole = g.d / ( Math.sin( Math.PI / countH ) * 2 ); // radius cutting circle
		const h = Math.sqrt( g.radius * g.radius - rHole * rHole ); // distance: sphere center to cutting circle
		
		// ... hole values for external use
		xp = g.radius *  Math.sin( theta ) * Math.cos( phi );
		yp = g.radius *  Math.cos( theta );
		zp = -g.radius * -Math.sin( theta ) * Math.sin( phi );
		
		xc = h / g.radius * xp;
		yc = h / g.radius * yp;
		zc = h / g.radius * zp;
		
		g.circles.push( [ xc, yc, zc,  rHole, div4Hole ] ); // values for external use
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		ya = h;
		
		for ( let i = 0, alpha = 0; i < countH; i ++, alpha += 2 * Math.PI / countH ) {
		
			//  cutting circle on top
			xa = rHole * Math.cos( alpha );
			za = rHole * Math.sin( alpha );
			 
			// rotate around z axis 
			xb = xa * Math.cos( theta ) - ya * Math.sin( theta ); 
			yb = xa * Math.sin( theta ) + ya * Math.cos( theta );
			
			// rotate around y axis 
			x = -xb * Math.cos( phi ) + za * Math.sin( phi ); 
			z = xb * Math.sin( phi ) + za * Math.cos( phi );
			
			y = yb; // for storing and checking bounds
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x < xmin ? x : xmin;
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function checkDistancesToUnite( m ) { // for new active front points
	
		let idxJ, xChk, yChk, zChk, ddUnite;
		let ddUniteMin = Infinity;
		unite = false;
		
		for ( let i = 0; i < insertFront.length; i ++ ) {
			
			getPoint( m + i );
			
			for ( let f = 0; f < fronts.length; f ++ ) {
				
				if ( f !== frontNo ) {
					
					xChk = ( xp > boundings[ f ][ 0 ] - g.d ) && ( xp < boundings[ f ][ 3 ] + g.d );
					yChk = ( yp > boundings[ f ][ 1 ] - g.d ) && ( yp < boundings[ f ][ 4 ] + g.d );
					zChk = ( zp > boundings[ f ][ 2 ] - g.d ) && ( zp < boundings[ f ][ 5 ] + g.d );
					
					if (  xChk || yChk || zChk ) {
						
						for ( let j = 0; j < fronts[ f ].length; j ++ ) {
							
							idxJ = fronts[ f ][ j ].idx * 3;
							
							// Hint: here (2) is exceptionally point in other front!
							x2 = g.positions[ idxJ ]; 
							y2 = g.positions[ idxJ + 1 ];
							z2 = g.positions[ idxJ + 2 ];
							
							ddUnite = squareLength ( x2 - xp, y2 - yp, z2 - zp );
							
							if ( ddUnite < dd && ddUnite < ddUniteMin ) {
								
								ddUniteMin = ddUnite; 
								iUnite = i;
								jUnite = j;
								fUnite = f;
								unite = true;	
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function uniteFront( m, i, f, j ) {
		
		let tmp = [];
		
		tmp[ 0 ] = front.slice( 0, m + i + 1 );	
		tmp[ 1 ] = fronts[ f ].slice( j , fronts[ f ].length );
		tmp[ 2 ] = fronts[ f ].slice( 0 , j + 1 );
		tmp[ 3 ] = front.slice( m + i, front.length );
		
		unionIdxA = m + i;
		unionIdxB = m + i + 1 + fronts[ f ].length
		
		front = [];
		
		for ( let t = 0; t < 4; t ++ ) {
			
			for ( let k = 0; k < tmp[ t ].length ; k ++ ) {
				
				front.push( tmp[ t ][ k ] );
				
			}
			
		}
		
		fronts[ f ] = []; // empty united front
		
		frontStock -= 1; // front is eliminated
		
	}
	
	function trianglesAtUnionPoints( ) {
		
		nIns = 0; // count inserted points
		
		calculateFrontAngle( unionIdxA );
		calculateFrontAngle( unionIdxA + 1 );
		
		if ( front[ unionIdxA ].ang < front[ unionIdxA + 1 ].ang ) {
			
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA + 1 + nIns );
			makeNewTriangles( unionIdxA + 1 + nIns );
			nIns += n - 1;
			
		} else {
			
			makeNewTriangles( unionIdxA + 1 );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA );
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
		}
		
		calculateFrontAngle( unionIdxB + nIns );
		calculateFrontAngle( unionIdxB + 1 + nIns );
		
		if ( front[ unionIdxB + nIns ].ang < front[ unionIdxB + 1 + nIns ].ang ) {
			
			makeNewTriangles( unionIdxB + nIns );
			nIns += n - 1;
			calculateFrontAngle( unionIdxB + 1 + nIns );
			makeNewTriangles( unionIdxB + 1 + nIns );
			
		} else {
			
			makeNewTriangles( unionIdxB + 1 + nIns );
			calculateFrontAngle( unionIdxB + nIns );
			makeNewTriangles( unionIdxB + nIns );
			
		}
		
	}
	
	function checkDistancesToSplit( m ) { // for new active front points
		
		let mj, mjIdx, ddSplit;
		let ddSplitMin = Infinity;
		split = false;
			
		for ( let i = 0; i < front.length ; i ++ ) {
			
			for ( let j = 0; j < n; j ++ ) { // check n new points (insertFront)
				
				mj = m + j;
				
				// except new points themselves and neighbor points
				if ( Math.abs( i - mj ) > 3 && Math.abs( i - mj ) < front.length - 3 ) {
					
					mjIdx = front[ mj ].idx * 3;
					
					// Hint: here (1) is exceptionally new point in the front!
					x1 = g.positions[ mjIdx ]; 
					y1 = g.positions[ mjIdx + 1 ];
					z1 = g.positions[ mjIdx + 2 ];
					
					getPoint( i );
					
					ddSplit = squareLength ( x1 - xp, y1 - yp, z1 - zp );
					
					if ( ddSplit < dd && ddSplit < ddSplitMin ) {
						
						ddSplitMin = ddSplit;
						iSplit = i;
						jSplit = mj;
						split = true; 
						
					}
					
				}
				
			}
			
		}
		
	}
		
	function splitFront( iSplit, jSplit ) {
		
		let k;
		
		front[ iSplit ].ang = 0;
		front[ jSplit ].ang = 0;
		
		if ( iSplit > jSplit )  { // swap
			
			k = jSplit;
			jSplit = iSplit;
			iSplit = k;
			
		} 
		
		splitIdx = iSplit;	// lower index
		
		partFront = [];
		
		// to duplicate
		let frontI = front[ iSplit ];
		let frontJ = front[ jSplit ];
		
		partFront = front.splice( iSplit + 1, jSplit - iSplit - 1 );
		partFront.unshift( frontI );
		partFront.push( frontJ );
		
		fronts.push( partFront );
		
		partFrontBounds( );
		
		frontStock += 1; // new front created
		
	}
	
	function trianglesAtSplitPoints( ) {
		
		nIns = 0; // count inserted points
		
		let idx0 = splitIdx; // splitIdx is the lower index 
		let idx1 = splitIdx + 1;
		
		calculateFrontAngle( idx0 );
		calculateFrontAngle( idx1 );
		
		if ( front[ idx1 ].ang < front[ idx0 ].ang ){
			
			makeNewTriangles( idx1 );
			nIns += n - 1;
			calculateFrontAngle( idx0 );
			makeNewTriangles( idx0 );
			
		} else {
			
			makeNewTriangles( idx0 );
			nIns += n - 1;
			calculateFrontAngle( idx1 + nIns );
			makeNewTriangles( idx1 + nIns );
			
		}
		
	}
	
	function getMinimalAngleIndex( ) {
		
		let angle = Infinity;
		let m;
		
		for ( let i = 0; i < front.length; i ++ ) {
			
			if( front[ i ].ang < angle  ) {
				
				angle = front[ i ].ang ;
				m = i;
				
			}
			
		}
		
		return m;
		
	}
	
	function makeNewTriangles( m ) {
		
		//	m:  minimal angle (index)
		
		insertFront = []; // new front points
		
		nT = Math.floor( 3 * front[ m ].ang / Math.PI ) + 1; // number of new triangles
		
		dAng = front[ m ].ang / nT;
		
		getSystemAtPoint( m );
		getNextPoint( m );
		
		d1 = length( x1 - xp, y1 - yp, z1 - zp );
		d2 = length( x2 - xp, y2 - yp, z2 - zp );
		d12 = length( x2 - x1, y2 - y1, z2 - z1 );
		
		// correction of dAng, nT in extreme cases
		
		if ( dAng < 0.8 && nT > 1 ) {
			
			nT --;
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( dAng > 0.8 && nT === 1 && d12 > 1.25 * g.d ) {
			
			nT = 2; 
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( d1 * d1 < 0.2 * dd ||  d2 * d2 < 0.2 * dd  ) {
			
			nT = 1;
			
		}
		
		n = nT - 1;  // n number of new points
		
		if ( n === 0 ) { // one triangle
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx; 
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	// stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			front[ nextFront( m ) ].ang = 0;
			
			front.splice( m, 1 ); // delete point with index m from the front
			
		} else { // more then one triangle
			
			xc = xp;
			yc = yp;
			zc = zp;
			
			for ( let i = 0,  phi = dAng; i < n; i ++, phi += dAng ) {
				
				xp = xc + Math.cos( phi ) * g.d * xt1 + Math.sin( phi ) * g.d * xt2; 
				yp = yc + Math.cos( phi ) * g.d * yt1 + Math.sin( phi ) * g.d * yt2;
				zp = zc + Math.cos( phi ) * g.d * zt1 + Math.sin( phi ) * g.d * zt2;
				
				len = length( xp, yp, zp ); // to bring the point to the surface (g.radius * ..)
				
				g.positions[ posIdx     ] = g.radius * xp / len;
				g.positions[ posIdx + 1 ] = g.radius * yp / len;
				g.positions[ posIdx + 2 ] = g.radius * zp / len;
				
				insertFront.push( { idx: posIdx / 3, ang: 0 } );
				
				posIdx += 3;
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx 
			g.indices[ indIdx + 2 ] = insertFront[ 0 ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	// stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			
			for ( let i = 0; i < n - 1; i ++ ) {
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = insertFront[ i ].idx;
				g.indices[ indIdx + 2 ] = insertFront[ i + 1 ].idx;
				
				indIdx += 3;
				
				///////////////  DEBUG triangles  //////////////////////
				// stp ++;
				////////////////////////////////////////////////////////
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = insertFront[ n - 1 ].idx;
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			front[ nextFront( m ) ].ang = 0;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	// stp ++;
			////////////////////////////////////////////////////////
			
			replaceFront( m, insertFront ); // replaces front[ m ] with new points
			
		}
		
	}
	
	function makeLastTriangle( ) {
		
		g.indices[ indIdx     ] = front[ 2 ].idx;
		g.indices[ indIdx + 1 ] = front[ 1 ].idx 
		g.indices[ indIdx + 2 ] = front[ 0 ].idx;
		
		indIdx += 3;
			
		///////////////  DEBUG triangles  //////////////////////
	 	// stp ++;
		////////////////////////////////////////////////////////
		
		front = [];
		
		fronts[ frontNo ] = [];
		
		frontStock -= 1; // close front
		
	}
	
	function chooseNextFront( ) {
		
		if ( frontStock > 0 ) {
			
			for ( let i = 0; i < fronts.length; i ++ ) {
				
				if ( fronts[ i ].length > 0 ) {
					
					frontNo = i;
					break;
					
				}
				
			}
			
			front = fronts[ frontNo ];
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				calculateFrontAngle( i ); // recalculate angles of next front
				
			}
			
		}
		
	}
	
	function atan2PI( x, y ) {
		
		let phi = Math.atan2( y, x );
		
		if ( phi < 0 ) phi = phi + Math.PI * 2;
		
		return phi;
		
	}
	
	function coordTangentialSystem( ) {
		
		let det = determinant( xt1, yt1, zt1, xt2, yt2, zt2, xn, yn, zn );
		
		xs1 = determinant( x1 - xp, y1 - yp, z1 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
		ys1 = determinant( xt1, yt1, zt1, x1 - xp, y1 - yp, z1 - zp, xn, yn, zn ) / det;
		//zs1 = determinant( xt1, yt1, zt1, xt2, yt2, zt2, x1 - xp, y1 - yp, z1 - zp ) / det; // not needed
		
		xs2 = determinant( x2 - xp, y2 - yp, z2 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
		ys2 = determinant( xt1, yt1, zt1, x2 - xp, y2 - yp, z2 - zp, xn, yn, zn ) / det;
		//zs2 = determinant( xt1, yt1, zt1, xt2, yt2, zt2, x2 - xp, y2 - yp, z2 - zp ) / det; // not needed
		
	}
	
	function calculateFrontAngle( i ) {
		
		let ang1, ang2;
		
		getSystemAtPoint( i );
		getNextPoint( i );
		
		coordTangentialSystem( );
		
		ang1 = atan2PI( xs1, ys1 );
		ang2 = atan2PI( xs2, ys2 );
		
		if ( ang2 < ang1 )  ang2 += Math.PI * 2;
		
		front[ i ].ang  = ang2 - ang1;
		
		if ( front[ i ].ang < 1.5 ) smallAngles.push( i );
		
	}
	
	function partFrontBounds( ) {
		
		let idx, xmin, ymin, zmin, xmax, ymax, zmax;
		
		partBounds = [];
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		for( let i = 0; i < partFront.length; i ++ ) {
			
			idx = partFront[ i ].idx * 3;
			
			x = g.positions[ idx ];
			y = g.positions[ idx + 1 ];
			z = g.positions[ idx + 2 ];
			
			xmin = x < xmin ? x : xmin;
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
		}
		
		partBounds.push( xmin, ymin, zmin, xmax, ymax, zmax );
		
		boundings.push( partBounds );
		
	}
	
	function replaceFront( m, fNew ) {
		
		let rear = front.splice( m, front.length - m );
		
		for ( let i = 0; i < fNew.length; i ++ ) {
			
			front.push( fNew[ i ] ); // new front points
			
		}
		
		for ( let i = 1; i < rear.length; i ++ ) { // i = 1: without old front point m 
			
			front.push( rear[ i ] );
			
		}
		
	}
	
	function getSystemAtPoint( i ) {
		
		getPrevPoint( i );
		getPoint( i );
		
		len = length( xp, yp, zp ); // to normalize
		 
		xn = xp / len;
		yn = yp / len
		zn = zp / len;
		
		// centerAngle = Math.acos( Math.abs( x1 * xp + y1 * yp + z1 * zp ) / ( g.radius * g.radius ) );
		const h = Math.abs( x1 * xp + y1 * yp + z1 * zp ) / g.radius; // distance: sphere center to cutting circle
		
		// center cutting circle (refers to previous point)
		xc = h / g.radius * xp; 
		yc = h / g.radius * yp;
		zc = h / g.radius * zp;
		
		// first tangent
		xt1 = x1 - xc;
		yt1 = y1 - yc;
		zt1 = z1 - zc;
		
		len = length( xt1, yt1, zt1 ); // to normalize
		
		xt1 = xt1 / len;
		yt1 = yt1 / len;
		zt1 = zt1 / len;
		
		// cross, second tangent
		
		xt2 = yn * zt1 - zn * yt1;
		yt2 = zn * xt1 - xn * zt1;
		zt2 = xn * yt1 - yn * xt1; 	
		
	}
	
	function storePoint( theta, phi ) {
		
		g.positions[ posIdx     ] = g.radius * Math.sin( theta ) * Math.cos( phi );
		g.positions[ posIdx + 1 ] = g.radius * Math.cos( theta );
		g.positions[ posIdx + 2 ] = -g.radius * Math.sin( theta ) * Math.sin( phi );
		
		posIdx += 3;
		
	}
	
	function getPrevPoint( i ) {
		
		frontPosIdx = front[ prevFront( i ) ].idx * 3;
		
		x1 = g.positions[ frontPosIdx ]; 
		y1 = g.positions[ frontPosIdx + 1 ];
		z1 = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getPoint( i ) {
		
		frontPosIdx = front[ i ].idx * 3;
		
		xp = g.positions[ frontPosIdx ]; 
		yp = g.positions[ frontPosIdx + 1 ];
		zp = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getNextPoint( i ) {
		
		frontPosIdx = front[ nextFront( i ) ].idx * 3;
		
		x2 = g.positions[ frontPosIdx ];
		y2 = g.positions[ frontPosIdx + 1 ];
		z2 = g.positions[ frontPosIdx + 2 ];
		
	}
	
}

function buildSphereWithHoles( ) {
	
	const squareLength = ( x,y,z ) => (  x*x + y*y + z*z );
	const length = ( x, y, z ) => ( Math.sqrt( x * x + y * y + z * z ) );
	const prevFront = ( i ) => ( i !== 0 ? i - 1 : front.length - 1 );
	const nextFront  = ( i ) => ( i !== front.length - 1 ? i + 1 : 0 );
	
	// radius = 1 is fixed - use three.js .scale
	
	let d; // rough edge length of the triangles
	let m; // index of the current front point
	let n; // number of new points
	let nT; // number of new triangles
	let nIns; // number of new points (after union or split)
	let dAng; // partial angle
	let len, d1, d2, d12, dd1, dd2, dd12; // lengths and their squares
	let iSplit, jSplit; // split front indices  
	let iUnite, jUnite, fUnite; // unite front indices, front number (to unite)
	let h; // distance center to circle
	let acute, concave; // front angle properties
	
	// points and vectors:
	let x, y, z, xp, yp, zp, xc, yc, zc, x1, y1, z1, x2, y2, z2, xt1, yt1, zt1, xt2, yt2, zt2, xv1, yv1, zv1, xv2, yv2, zv2;
	
	//  preparation
	
	const faceCount = g.detail * g.detail * 15;
	const posCount  = g.detail * g.detail * 10;
	
	g.indices = new Uint32Array( faceCount * 3 );
	g.positions = new Float32Array( posCount * 3 );
	//g.normals = new Float32Array( posCount * 3 );
	
	g.setIndex( new THREE.BufferAttribute( g.indices, 1 ) );
	g.addAttribute( 'position', new THREE.BufferAttribute( g.positions, 3 ) );
	
	d = Math.PI / g.detail; // rough side length of the triangles
	const dd = d * d;
	
	let posIdx = 0;
	let indIdx = 0;
	let frontPosIdx, unionIdxA, unionIdxB, splitIdx;
	 
	let front = []; // active front // front[ i ]: object { idx: 0, ang: 0 }
	let partFront = []; // separated part of the active front
	let insertFront = []; // new front points to insert into active front
	let fronts = []; // all fronts
	let partBounds = []; // bounding box of partFront [ xmin, ymin, zmin, xmax, ymax, zmax ]
	let boundings = []; // fronts bounding boxes  
	let smallAngles = []; // new angles < 1.5
	
	let frontNo, frontStock;
	let unite = false;
	let split = false;
	
	frontNo = 0; // active front number
	frontStock = 0; // number of fronts still to be processed
	
	// define holes
	
	if ( g.holes.length === 0 ) {
		
		makeFirstTriangle( );
		
	} else {
		
		g.circles = []; // [ center, r, count ] of holes for external use
		
		for ( let i = 0; i < g.holes.length; i ++ ) {
			
			if ( g.holes[ i ].length === 3 ) {
				
				makeCircularHole( i );  // [ theta, phi, count ]
				
			} else {
				
				makePointsHole( i ); // points: [ theta, phi, ... ]
				
			}
		
		}
	
	}
	
	frontNo = 0;
	front = fronts[ frontNo ];
	
	//////////////// DEBUG triangles //////////////////////////////////////
	// let stp = 0; 
	///////////////////////////////////////////////////////////////////////
	
	// ------  triangulation cycle -------------
	
	while ( frontStock > 0 ) {
		
		if ( !unite && !split ) { // triangulation on the front
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				if( front[ i ].ang === 0 ) calculateFrontAngle( i ); // is to be recalculated (angle was set to zero)
				
			}
			
			m = getMinimalAngleIndex( ); // front angle
			makeNewTriangles( m );
			
			if ( front.length > 9 && smallAngles.length === 0 ) {
				
				checkDistancesToUnite( m );
				checkDistancesToSplit( m );
				
			}
			
			if ( front.length === 3 ) {
				
				makeLastTriangle( ); // last triangle closes the front
				chooseNextFront( ); // if aviable
				
			}
			
		} else { // unite the active front to another front or split the active front
			
			if ( unite ) {
				
				uniteFront(  m, iUnite, fUnite, jUnite );
				trianglesAtUnionPoints( );
				unite = false;
				
			} else if ( split ) {
				
				splitFront( iSplit, jSplit );
				trianglesAtSplitPoints( );
				split = false;
				
			}
			
		}
		
	}
    
	// ..... detail functions .....
	
	function makeFirstTriangle ( ) {
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		storePoint( 0, 0 ); // ( theta, phi )
		storePoint( d, -Math.PI / 6 );
		storePoint( d,  Math.PI / 6 );
		
		g.indices[ 0 ] = 0;
		g.indices[ 1 ] = 1; 
		g.indices[ 2 ] = 2;
		
		indIdx += 3;
		
		///////////////  DEBUG triangles  //////////////////////
	 	//  stp ++;
		////////////////////////////////////////////////////////
		
		fronts[ frontNo ].push( { idx: 0, ang: 0 }, { idx: 1, ang: 0 }, { idx: 2, ang: 0 } );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function storePoint( theta, phi ) {
		
		g.positions[ posIdx     ] = Math.sin( theta ) * Math.cos( phi );
		g.positions[ posIdx + 1 ] = Math.cos( theta );
		g.positions[ posIdx + 2 ] = -Math.sin( theta ) * Math.sin( phi );
		
		posIdx += 3;
		
	}
	
	function makePointsHole( i ) {
		
		let theta, phi, count, xmin, ymin, zmin, xmax, ymax, zmax;
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		theta = g.holes[ i ][ 0 ];
		phi = g.holes[ i ][ 1 ]; 
		
		x1 = Math.sin( theta ) * Math.cos( phi );
		y1 = Math.cos( theta );
		z1 = -Math.sin( theta ) * Math.sin( phi );
		
		for ( let j = 1; j < g.holes[ i ].length / 2 + 1; j ++ ) {
			
			g.positions[ posIdx     ] = x1;
			g.positions[ posIdx + 1 ] = y1;
			g.positions[ posIdx + 2 ] = z1;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x1 < xmin ? x1 : xmin;
			ymin = y1 < ymin ? y1 : ymin;
			zmin = z1 < zmin ? z1 : zmin;
			
			xmax = x1 > xmax ? x1 : xmax;
			ymax = y1 > ymax ? y1 : ymax;
			zmax = z1 > zmax ? z1 : zmax;
			
			posIdx += 3;
			
			theta = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 : 0 ]; // 0 => connect to start
			phi = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 + 1 : 1 ]; // 1 => connect to start
			
			x2 = Math.sin( theta ) * Math.cos( phi );
			y2 = Math.cos( theta );
			z2 = -Math.sin( theta ) * Math.sin( phi );
			
			xv2 = x2 - x1;
			yv2 = y2 - y1;
			zv2 = z2 - z1;
			
			len = length( xv2, yv2, zv2 );
			
			if ( len > d ) {
				
				count = Math.ceil( len / d );
				
				for ( let k = 1; k < count; k ++ ) {
					
					x = x1 + k * xv2 / count;
					y = y1 + k * yv2 / count;
					z = z1 + k * zv2 / count;
					
					len = length( x, y, z );
					
					g.positions[ posIdx     ] = x / len;
					g.positions[ posIdx + 1 ] = y / len;
					g.positions[ posIdx + 2 ] = z / len;
					
					fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
					
					xmin = x < xmin ? x : xmin;
					ymin = y < ymin ? y : ymin;
					zmin = z < zmin ? z : zmin;
					
					xmax = x > xmax ? x : xmax;
					ymax = y > ymax ? y : ymax;
					zmax = z > zmax ? z : zmax;
					
					posIdx += 3;
					
				}
				
			}
			
			x1 = x2;
			y1 = y2;
			z1 = z2;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function makeCircularHole( i ) {
		
		let theta = g.holes[ i ][ 0 ];
		let phi = g.holes[ i ][ 1 ];
		let count = g.holes[ i ][ 2 ];
		
		let xmin, ymin, zmin, xmax, ymax, zmax;
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		xp = Math.sin( theta ) * Math.cos( phi );
		yp = Math.cos( theta );
		zp = -Math.sin( theta ) * Math.sin( phi );
		
		let r = count / detail / 2; // radius cutting circle
		
		h = Math.sqrt( 1 - r * r );
		
		if ( !(xp === 0 && yp === 0 ) ) {
			
			xt1 = -yp;
			yt1 = xp;
			zt1 = 0;
			
		} else { 
			
			xt1 = 0;
			yt1 = 1;
			zt1 = 0;
			
		}
		
		// cross
		
		xt2 = yp * zt1 - zp * yt1;
		yt2 = zp * xt1 - xp * zt1;
		zt2 = xp * yt1 - yp * xt1;
		
		len = length( xt1, yt1, zt1 ); // to normalize
		
		xt1 = xt1 / len;
		yt1 = yt1 / len;
		zt1 = zt1 / len;
		
		len = length( xt2, yt2, zt2 ); // to normalize
		
		xt2 = xt2 / len;
		yt2 = yt2 / len;
		zt2 = zt2 / len;
		
		xc = h * xp;
		yc = h * yp;
		zc = h * zp;
		
		g.circles.push( [ xc, yc, zc, r, count ] ); // for external use
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		for ( let i = 0, phi = 0; i < count; i ++, phi += 2 * Math.PI / count ) {
			
			x = xc + Math.cos( phi ) * r * xt1 + Math.sin( phi ) * r * xt2;
			y = yc + Math.cos( phi ) * r * yt1 + Math.sin( phi ) * r * yt2;
			z = zc + Math.cos( phi ) * r * zt1 + Math.sin( phi ) * r * zt2;
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x < xmin ? x : xmin;
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function checkDistancesToUnite( m ) { // for new active front points
		
		let idx, idxJ, xChk, yChk, zChk, ddUnite;
		let ddUniteMin = Infinity;
		unite = false;
		
		for ( let i = 0; i < insertFront.length; i ++ ) {
			
			getPoint( m + i );
			
			for ( let f = 0; f < fronts.length; f ++ ) {
				
				if ( f !== frontNo ) {
					
					xChk = ( xp > boundings[ f ][ 0 ] - d ) && ( xp < boundings[ f ][ 3 ] + d );
					yChk = ( yp > boundings[ f ][ 1 ] - d ) && ( yp < boundings[ f ][ 4 ] + d );
					zChk = ( zp > boundings[ f ][ 2 ] - d ) && ( zp < boundings[ f ][ 5 ] + d );
					
					if (  xChk || yChk || zChk ) {
						
						for ( let j = 0; j < fronts[ f ].length; j ++ ) {
							
							idxJ = fronts[ f ][ j ].idx * 3;
							
							// Hint: here (2) is exceptionally point in other front!
							x2 = g.positions[ idxJ ]; 
							y2 = g.positions[ idxJ + 1 ];
							z2 = g.positions[ idxJ + 2 ];
							
							ddUnite = squareLength ( x2 - xp, y2 - yp, z2 - zp );
							
							if ( ddUnite < dd && ddUnite < ddUniteMin ) {
								
								ddUniteMin = ddUnite;
								iUnite = i;
								fUnite = f;
								jUnite = j;
								unite = true;
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function uniteFront( m, i, f, j ) {
		
		let tmp = [];
		
		tmp[ 0 ] = front.slice( 0, m + i + 1 );	
		tmp[ 1 ] = fronts[ f ].slice( j , fronts[ f ].length );
		tmp[ 2 ] = fronts[ f ].slice( 0 , j + 1 );
		tmp[ 3 ] = front.slice( m + i, front.length );
		
		unionIdxA = m + i;
		unionIdxB = m + i + 1 + fronts[ f ].length
		
		front = [];
		
		for ( let t = 0; t < 4; t ++ ) {
			
			for ( let k = 0; k < tmp[ t ].length ; k ++ ) {
				
				front.push( tmp[ t ][ k ] );
				
			}
			
		}
		
		fronts[ f ] = []; // empty united front
		
		frontStock -= 1; // front is eliminated
		
	}
	
	function trianglesAtUnionPoints( ) {
		
		nIns = 0; // count inserted points
		
		calculateFrontAngle( unionIdxA );
		calculateFrontAngle( unionIdxA + 1 );
		
		if ( front[ unionIdxA ].ang < front[ unionIdxA + 1 ].ang ) {
			
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA + 1 + nIns );
			makeNewTriangles( unionIdxA + 1 + nIns );
			nIns += n - 1;
			
		} else {
			
			makeNewTriangles( unionIdxA + 1 );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA );
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
		}
		
		calculateFrontAngle( unionIdxB + nIns );
		calculateFrontAngle( unionIdxB + 1 + nIns );
		
		if ( front[ unionIdxB + nIns ].ang < front[ unionIdxB + 1 + nIns ].ang ) {
			
			makeNewTriangles( unionIdxB + nIns );
			nIns += n - 1;
			calculateFrontAngle( unionIdxB + 1 + nIns );
			makeNewTriangles( unionIdxB + 1 + nIns );
			
		} else {
			
			makeNewTriangles( unionIdxB + 1 + nIns );
			calculateFrontAngle( unionIdxB + nIns );
			makeNewTriangles( unionIdxB + nIns );
			
		}
		
	}
	
	function checkDistancesToSplit( m ) { // for new active front points
		
		let mj, mjIdx, ddSplit;
		let ddSplitMin = Infinity;
		split = false;
		
		for ( let i = 0; i < front.length ; i ++ ) {
			
			for ( let j = 0; j < n; j ++ ) { // check n new points (insertFront)
				
				mj = m + j;
				
				// except new points themselves and neighbor points
				if ( Math.abs( i - mj ) > 3 && Math.abs( i - mj ) < front.length - 3 ) {
					
					mjIdx = front[ mj ].idx * 3;
					
					// Hint: here (1) is exceptionally new point in the front!
					x1 = g.positions[ mjIdx ]; 
					y1 = g.positions[ mjIdx + 1 ];
					z1 = g.positions[ mjIdx + 2 ];
					
					getPoint( i );
					
					ddSplit = squareLength ( x1 - xp, y1 - yp, z1 - zp );
					
					if ( ddSplit < dd && ddSplit < ddSplitMin ) {
						
						ddSplitMin = ddSplit;
						iSplit = i;
						jSplit = mj;
						split = true; 
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function splitFront( iSplit, jSplit ) {
		
		let k;
		
		front[ iSplit ].ang = 0;
		front[ jSplit ].ang = 0;
		
		if ( iSplit > jSplit )  { // swap
			
			k = jSplit;
			jSplit = iSplit;
			iSplit = k;
			
		} 
		
		splitIdx = iSplit;	// lower index
		
		partFront = [];
		
		// to duplicate
		let frontI = front[ iSplit ];
		let frontJ = front[ jSplit ];
		
		partFront = front.splice( iSplit + 1, jSplit - iSplit - 1 );
		partFront.unshift( frontI );
		partFront.push( frontJ );
		
		fronts.push( partFront );
		
		partFrontBounds( );
		
		frontStock += 1; // new front created
		
	}
	
	function trianglesAtSplitPoints( ) {
		
		nIns = 0; // count inserted points
		
		let idx0 = splitIdx; // splitIdx is the lower index 
		let idx1 = splitIdx + 1;
		
		calculateFrontAngle( idx0 );
		calculateFrontAngle( idx1 );
		
		if ( front[ idx1 ].ang < front[ idx0 ].ang ){
		
			makeNewTriangles( idx1 );
			nIns += n - 1;
			calculateFrontAngle( idx0 );
			makeNewTriangles( idx0 );
			
		} else {
			
			makeNewTriangles( idx0 );
			nIns += n - 1;
			calculateFrontAngle( idx1 + nIns );
			makeNewTriangles( idx1 + nIns );
			
		}
		
	}
	
	function getMinimalAngleIndex( ) {
		
		let angle = Infinity;
		let m;
		
		for ( let i = 0; i < front.length; i ++ ) {
			
			if( front[ i ].ang < angle  ) {
				
				angle = front[ i ].ang ;
				m = i;
				
			}
			
		}
		
		return m;
		
	}
	
	function makeNewTriangles( m ) {
		
		//	m:  minimal angle (index)
		
		insertFront = [];
		
		nT = Math.floor( 3 * front[ m ].ang / Math.PI ) + 1; // number of new triangles
		
		dAng = front[ m ].ang / nT;
		
		getSystemAtPoint( m );
		getNextPoint( m );
		
		d1 = length( x1 - xp, y1 - yp, z1 - zp );
		d2 = length( x2 - xp, y2 - yp, z2 - zp );
		d12 = length( x2 - x1, y2 - y1, z2 - z1 );
		
		// correction of dAng, nT in extreme cases
		
		if ( dAng < 0.8 && nT > 1 ) {
			
			nT --;
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( dAng > 0.8 && nT === 1 && d12 > 1.25 * d ) {
			
			nT = 2; 
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( d1 * d1 < 0.2 * d * d ||  d2 * d2 < 0.2 * d * d  ) {
			
			nT = 1;
			
		}
		
		n = nT - 1;  // n number of new points
		
		if ( n === 0 ) { // one triangle
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx; 
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	//  stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			front[ nextFront( m ) ].ang = 0;
			
		} else { // more then one triangle
			
			for ( let i = 0,  phi = dAng; i < n; i ++, phi += dAng ) {
				
				xp = xc + Math.cos( phi ) * d * xt1 + Math.sin( phi ) * d * xt2; 
				yp = yc + Math.cos( phi ) * d * yt1 + Math.sin( phi ) * d * yt2;
				zp = zc + Math.cos( phi ) * d * zt1 + Math.sin( phi ) * d * zt2;
				
				len = length( xp, yp, zp );  // to normalize
				
				g.positions[ posIdx     ] = xp / len;
				g.positions[ posIdx + 1 ] = yp / len;
				g.positions[ posIdx + 2 ] = zp / len;
				
				insertFront.push( { idx: posIdx / 3, ang: 0 } );
				
				posIdx += 3;
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx 
			g.indices[ indIdx + 2 ] = insertFront[ 0 ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	//  stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			
			for ( let i = 0; i < n - 1; i ++ ) {
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = insertFront[ i ].idx;
				g.indices[ indIdx + 2 ] = insertFront[ i + 1 ].idx;
				
				indIdx += 3;
				
				///////////////  DEBUG triangles  //////////////////////
				//  stp ++;
				////////////////////////////////////////////////////////
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = insertFront[ n - 1 ].idx;
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			front[ nextFront( m ) ].ang = 0;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	//  stp ++;
			////////////////////////////////////////////////////////
			
		}
		
		replaceFront( m, insertFront ); // replaces front[ m ] with new points
		
	}
	
	function makeLastTriangle( ) {
		
		g.indices[ indIdx     ] = front[ 2 ].idx;
		g.indices[ indIdx + 1 ] = front[ 1 ].idx 
		g.indices[ indIdx + 2 ] = front[ 0 ].idx;
		
		indIdx += 3;
		
		///////////////  DEBUG triangles  //////////////////////
	 	// stp ++;
		////////////////////////////////////////////////////////
		
		front = [];
		
		fronts[ frontNo ] = [];
		
		frontStock -= 1; // close front
		
	}
	
	function chooseNextFront( ) {
		
		if ( frontStock > 0 ) {
			
			for ( let i = 0; i < fronts.length; i ++ ) {
				
				if ( fronts[ i ].length > 0 ) {
					
					frontNo = i;
					break;
					
				}
				
			}
			
			front = fronts[ frontNo ];
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				calculateFrontAngle( i ); // recalculate angles of next front
				
			}
			
		}
		
	}
	
	function calculateFrontAngle( i ) {
		
		getPrevPoint( i ); // (1)
		getPoint( i );
		getNextPoint( i ); // (2)
		
		// centerAngle = Math.acos( Math.abs( x1 * xp + y1 * yp + z1 * zp ) );
		// r = Math.sin( centerAngle ); // radius circle
		// h = Math.cos( centerAngle ); // distance center to  circle
		
		h = Math.abs( x1 * xp + y1 * yp + z1 * zp );
		
		// center cutting circle (refers to previous point)
		xc = h * xp; 
		yc = h * yp;
		zc = h * zp;
		
		xv1 = xc - x1;
		yv1 = yc - y1;
		zv1 = zc - z1;
		
		len = length( xv1, yv1, zv1 ); // to normalize
		
		xv1 = xv1 / len;
		yv1 = yv1 / len;
		zv1 = zv1 / len;
		
		xv2 = x2 - xc;
		yv2 = y2 - yc;
		zv2 = z2 - zc;
		
		len = length( xv2, yv2, zv2 ); // to normalize
		
		xv2 = xv2 / len;
		yv2 = yv2 / len;
		zv2 = zv2 / len;
		
		front[ i ].ang  = Math.acos( Math.abs( xv1 * xv2 + yv1 * yv2 + zv1 * zv2 ) );
		
		// cross, to detect curvature
		x = yv1 * zv2 - zv1 * yv2;
		y = zv1 * xv2 - xv1 * zv2;
		z = xv1 * yv2 - yv1 * xv2;
		
		len = length( x, y, z ); // to normalize
		
		x = xp + x / len;
		y = yp + y / len;
		z = zp + z / len;
		
		concave = ( length( x, y, z ) < 1 );
		
		d1 = length( x1 - xp, y1 - yp, z1 - zp );
		d2 = length( x2 - xp, y2 - yp, z2 - zp );
		d12 = length( x2 - x1, y2 - y1, z2 - z1 );
		
		dd1 = d1 * d1;
		dd2 = d2 * d2;
		dd12 = d12 * d12;
		
		acute = ( dd12 < ( dd1 + dd2) );
		
		// if ( concave && acute ) front[ i ].ang  += 0;
		if ( concave && !acute ) front[ i ].ang  =  Math.PI - front[ i ].ang ;
		if ( !concave && acute ) front[ i ].ang  = 2 * Math.PI - front[ i ].ang ;
		if ( !concave && !acute ) front[ i ].ang  = Math.PI + front[ i ].ang ;
		
		if ( front[ i ].ang < 1.5 ) smallAngles.push( i );
		
	}
	
	function partFrontBounds( ) {
		
		let idx, xmin, ymin, zmin, xmax, ymax, zmax;
		
		partBounds = [];
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		for( let i = 0; i < partFront.length; i ++ ) {
			
			idx = partFront[ i ].idx * 3;
			
			x = g.positions[ idx ]; 
			y = g.positions[ idx + 1 ];
			z = g.positions[ idx + 2 ];
			
			xmin = x < xmin ? x : xmin; 
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
		}
		
		partBounds.push( xmin, ymin, zmin, xmax, ymax, zmax );
		
		boundings.push( partBounds );
		
	}
	
	function replaceFront( m, fNew ) {
		
		let rear = front.splice( m, front.length - m )
		
		for ( let i = 0; i < fNew.length; i ++ ) {
			
			front.push( fNew[ i ] ); //  new front points
			
		}
		
		for ( let i = 1; i < rear.length; i ++ ) { // 1: without old front point m 
			
			front.push( rear[ i ] );
			
		}
		
	}
	
	function getSystemAtPoint( i ) {
		
		getPrevPoint( i );
		getPoint( i );
		
		// centerAngle = Math.acos( Math.abs( x1 * xp + y1 * yp + z1 * zp ) );
		// r = Math.sin( centerAngle ); // radius cutting circle	
		// h = Math.cos( centerAngle ); // distance center to cutting circle
		
		h = Math.abs( x1 * xp + y1 * yp + z1 * zp );
		
		// center cutting circle (refers to previous point)
		xc = h * xp; 
		yc = h * yp;
		zc = h * zp;
		
		// first tangent
		xt1 = x1 - xc;
		yt1 = y1 - yc;
		zt1 = z1 - zc;
		
		len = length( xt1, yt1, zt1 ); // to normalize
		
		xt1 = xt1 / len;
		yt1 = yt1 / len;
		zt1 = zt1 / len;
		
		// cross, second tangent (sphere radius 1: p equals normal)
		
		xt2 = yp * zt1 - zp * yt1;
		yt2 = zp * xt1 - xp * zt1;
		zt2 = xp * yt1 - yp * xt1;
		
	}
	
	function getPrevPoint( i ) {
		
		frontPosIdx = front[ prevFront( i ) ].idx * 3 ;
		x1 = g.positions[ frontPosIdx ]; 
		y1 = g.positions[ frontPosIdx + 1 ];
		z1 = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getPoint( i ) {
		
		frontPosIdx = front[ i ].idx * 3;
		xp = g.positions[ frontPosIdx ]; 
		yp = g.positions[ frontPosIdx + 1 ];
		zp = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getNextPoint( i ) {
		
		frontPosIdx = front[ nextFront( i ) ].idx * 3;
		x2 = g.positions[ frontPosIdx ];
		y2 = g.positions[ frontPosIdx + 1 ];
		z2 = g.positions[ frontPosIdx + 2 ];
		
	}
	
}

exports.createSphereWithHoles = createSphereWithHoles;
exports.buildSphereWithHolesObj = buildSphereWithHolesObj;
exports.buildSphereWithHoles = buildSphereWithHoles;

// ............................ Cylinder with Holes (Triangulation) ................................

function createCylinderWithHoles( p ) {

	/* example for parameters object p 
		d: 0.052, // rough side length of the triangles
		div4: 30, // division of the quarter circle
		bottom: -1, 
		div4Btm: 30, // division bottom adaptation, (to quarter, >= div4)
		phiBtm: 1.57, // rotation of adaptive-deformed circle (Bottom)
		top: 1,
		div4Top: 33, // division top adaptation, (to quarter, >= div4)
		phiTop: -0.2, // rotation of adaptive-deformed circle (Top)		
		holes: [
			// circular (deformed) hole, 3 elements: [ y, phi, div4Hole ], div4Hole <= div4	
			[   0.3,  1.6, 12 ],
			[  -0.4,  3.7, 14 ],
			[  -0.1, -0.9, 18 ],
			//points hole,: array of points y, phi, ...  (last point is connected to first)
			[ 0.15,0.45, 0.5,0.9, 0.8,0.6, 0.75,-0.2, 0.1,-0.15  ]
		]
	*/
	
	g = this;  //  THREE.BufferGeometry() - geometry object from three.js
	
	g.d = p.d !== undefined ? p.d : 2 * Math.sin( Math.PI / 24 ); // to g.div4 default
	g.div4 = p.div4 !== undefined ? p.div4 : 6; // 6 * 4 = 24 circle divisions
	g.btm = p.bottom !== undefined ? p.bottom : -1; // yMin
	g.div4Btm = p.div4Btm !== undefined ? p.div4Btm : Number.MAX_SAFE_INTEGER, // bottom adaptation, default: plane circle
	g.phiBtm = p.phiBtm !== undefined ? p.phiBtm : 0;
	g.top = p.top !== undefined ? p.top : 1; // yMax
	g.div4Top = p.div4Top !== undefined ? p.div4Top : Number.MAX_SAFE_INTEGER, // top adaptation, default: plane circle
	g.phiTop = p.phiTop !== undefined ? p.phiTop : 0;
	g.holes = p.holes !== undefined ? p.holes : [];
	
	g.detail = g.div4 * 4; // division of the circle
	
	g.radius = g.d / Math.sin( Math.PI / g.detail ) / 2; // cylinder radius, for external use as well
	
	g.buildCylinderWithHoles = buildCylinderWithHoles;
	g.buildCylinderWithHoles( );
	
}

function buildCylinderWithHoles( ) {
	
	const dd = g.d * g.d;
	
	const squareLength = ( x,y,z ) => ( x*x + y*y + z*z );
	const length = ( x, y, z ) => ( Math.sqrt( x * x + y * y + z * z ) );
	const lenXZ = ( x, z ) => ( Math.sqrt( x * x + z * z ) );
	const prevFront = ( i ) => ( i !== 0 ? i - 1 : front.length - 1 );
	const nextFront  = ( i ) => ( i !== front.length - 1 ? i + 1 : 0 );
	const detYc0 = ( xa,ya,za, xb,yb,zb, xc,zc ) => ( xa*yb*zc + ya*zb*xc - za*yb*xc - ya*xb*zc ); // determinant yc = 0;
	
	let m; // index of the current front point
	let n; // number of new points
	let nT; // number of new triangles
	let nIns; // number of new points (after union or split)
	let dAng; // partial angle
	let len, d1, d2, d12; // lengths
	let iSplit, jSplit; // split front indices  
	let iUnite, jUnite, fUnite; // unite front indices, front number (to unite) 
	
	// points and vectors:
	let x, y, z, xp, yp, zp; // coordinates point and actual point p
	let x1, y1, z1, x2, y2, z2; // previous and next point to p in front
	let xn, zn; // normal, gradient  (cylinder: yn = 0)
	let xt1, yt1, zt1, xt2, yt2, zt2; // tangents
	let xs1, ys1, xs2, ys2; // p in tangential system (only x, y required)
	let xc, yc, zc; // actual point as center point for new points
	
	//  preparation
	
	const faceCount = g.detail * g.detail * 15 ;
	const posCount  = g.detail * g.detail * 10 ;
	
	g.indices = new Uint32Array( faceCount * 3 );
	g.positions = new Float32Array( posCount * 3 );
	//g.normals = new Float32Array( posCount * 3 );
	
	g.setIndex( new THREE.BufferAttribute( g.indices, 1 ) );
	g.addAttribute( 'position', new THREE.BufferAttribute( g.positions, 3 ) );
	
	let posIdx = 0;
	let indIdx = 0;
	let frontPosIdx, unionIdxA, unionIdxB, splitIdx;
	 
	let front = []; // active front // front[ i ]: object { idx: 0, ang: 0 }
	let partFront = []; // separated part of the active front (to split)
	let insertFront = []; // new front points to insert into active front
	let fronts = []; // all fronts
	let partBounds = []; // bounding box of partFront [ xmin, ymin, zmin, xmax, ymax, zmax ]
	let boundings = []; // fronts bounding boxes
	let smallAngles = []; // new angles < 1.5
	
	let frontNo, frontStock;
	let unite = false;
	let split = false;
	
	// define fronts for cylinder boundaries y-axis
	
	frontNo = 0; // active front number
	frontStock = 0; // number of fronts still to be processed
	makeBoundaryFront( g.btm, g.div4Btm, -g.phiBtm,  1 ); // ... , sign
	makeBoundaryFront( g.top, g.div4Top, -g.phiTop, -1 ); // ... , sign
	
	g.adapt = []; // array of arrays [ x0, y0, z0, rHole, div4 ], cylinder hole values for external use
	
	// define holes fronts
	
	for ( let i = 0; i < g.holes.length; i ++ ) {
		
		if ( g.holes[ i ].length === 3 ) {
			
			makeCircularHole( i );  // [ y, phi, div4 ]
			
		} else {
			
			makePointsHole( i ); // points: [ y, phi, ... ]
			
		}
	
	}
	
	frontNo = 0;
	front = fronts[ frontNo ];
	
	//////////////////  DEBUG triangles //////////////////////////////////
	//  let stp = 0;
	//////////////////////////////////////////////////////////////////////
	
	// ------ triangulation cycle -------------
	
	while ( frontStock > 0 ) {
		
		if (  !unite && !split ) { // triangulation on the front
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				if( front[ i ].ang === 0 ) calculateFrontAngle( i ); // is to be recalculated (angle was set to zero)
				
			}
			
			m = getMinimalAngleIndex( ); // front angle
			makeNewTriangles( m );
			
			if ( front.length > 9 && smallAngles.length === 0 ) {
				
				checkDistancesToUnite( m );
				checkDistancesToSplit( m );
				
			}
			
			if ( front.length === 3 ) {
				
				makeLastTriangle( ); // last triangle closes the front
				chooseNextFront( ); // if aviable
				
			}
			
		} else { // unite the active front to another front or split the active front
			
			if ( unite ) {
				
				uniteFront(  m, iUnite, fUnite, jUnite );
				trianglesAtUnionPoints( );
				unite = false;
				
			} else if ( split ) {
				
				splitFront( iSplit, jSplit );
				trianglesAtSplitPoints( );
				split = false;
				
			}
			
		}
		
	}
	
	// .....  detail functions .....
	
	function makeBoundaryFront( bd, divAdp, phiAdp, sign ) {
		
		// bd boundary, divAdp adaptation, phiAdp rotation of adaptive-deformed circle, rotation sign
		
		const rAdp = g.d / Math.sin( Math.PI / divAdp / 4 ) / 2 ;
		
		let xmin, ymin, zmin, xmax, ymax, zmax;
		let x0, z0;
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = []
		
		xmin = zmin = Infinity;
		ymin = ymax = bd;
		xmax = zmax = -Infinity;
		
		for ( let i = 0, phi = 0; i < g.detail; i ++, phi += Math.PI * 2 / g.detail ) {
			
			// (adaptive-deformed) circle
			
			x = g.radius * Math.cos( phi );
			y = bd + sign * ( -rAdp +  Math.sqrt( rAdp * rAdp - g.radius * g.radius * Math.cos( phi ) * Math.cos( phi ) ) );
			z = g.radius * Math.sin( sign * phi );
			
			if ( phiAdp !== 0 ) {
				
				x0 = x;
				z0 = z;
				
				// rotate around y axis 
				x = x0 * Math.cos( phiAdp ) - z0 * Math.sin( phiAdp );
				z = x0 * Math.sin( phiAdp ) + z0 * Math.cos( phiAdp );
			}
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x < xmin ? x : xmin;
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function makePointsHole( i ) {
		
		let  phi, count, xmin, ymin, zmin, xmax, ymax, zmax, xv2, yv2, zv2;
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		phi = g.holes[ i ][ 1 ]; 
		
		x1 = g.radius * Math.cos( phi );
		y1 = g.holes[ i ][ 0 ];
		z1 = -g.radius * Math.sin( phi );
		
		for ( let j = 1; j < g.holes[ i ].length / 2 + 1; j ++ ) {
		
			g.positions[ posIdx     ] = x1;
			g.positions[ posIdx + 1 ] = y1;
			g.positions[ posIdx + 2 ] = z1;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x1 < xmin ? x1 : xmin;
			ymin = y1 < ymin ? y1 : ymin;
			zmin = z1 < zmin ? z1 : zmin;
			
			xmax = x1 > xmax ? x1 : xmax;
			ymax = y1 > ymax ? y1 : ymax;
			zmax = z1 > zmax ? z1 : zmax;
			
			posIdx += 3;
			
			phi = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 + 1 : 1 ]; // 1 => connect to start
			
			x2 = g.radius * Math.cos( phi );
			y2 = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 : 0 ]; // 0 => connect to start
			z2 = -g.radius * Math.sin( phi );
			
			xv2 = x2 - x1;
			yv2 = y2 - y1;
			zv2 = z2 - z1;
			
			len = length( xv2, yv2, zv2 );
			
			if ( len > g.d ) {
				
				count = Math.ceil( len / g.d );
				
				for ( let k = 1; k < count; k ++ ) {
					
					x = x1 + k * xv2 / count;
					y = y1 + k * yv2 / count;
					z = z1 + k * zv2 / count;
					
					len = lenXZ( x, z );   // to bring the point to the surface (radius * ..)
					
					g.positions[ posIdx     ] = g.radius * x / len;
					g.positions[ posIdx + 1 ] = y;
					g.positions[ posIdx + 2 ] = g.radius * z / len;
					
					fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
					
					xmin = x < xmin ? x : xmin;
					ymin = y < ymin ? y : ymin;
					zmin = z < zmin ? z : zmin;
					
					xmax = x > xmax ? x : xmax;
					ymax = y > ymax ? y : ymax;
					zmax = z > zmax ? z : zmax;
					
					posIdx += 3;
					
				}
				
			}
			
			x1 = x2;
			y1 = y2;
			z1 = z2;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function makeCircularHole( i ) {
		
		let x0, z0;
		const y0 = g.holes[ i ][ 0 ];
		const phi = g.holes[ i ][ 1 ];
		const div4 = g.holes[ i ][ 2 ];
		const countH = div4 * 4;
		let xmin, ymin, zmin, xmax, ymax, zmax;
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		const rHole = g.d / ( Math.sin( Math.PI / countH ) * 2 ); // radius (x-deformed) cutting circle
		
		x0 = rHole * Math.sin( phi );
		z0 = rHole * Math.cos( phi ); 
		
		// cylinder hole values for external use
		g.adapt.push( [ x0, y0, z0, rHole, div4 ] );
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
		for ( let i = 0, alpha = 0; i < countH; i ++, alpha += 2 * Math.PI / countH ) {
			
			// (deformed) cutting circle in x-axis direction
			
			x0 = Math.sqrt( g.radius * g.radius - rHole * rHole * Math.cos( alpha ) * Math.cos( alpha ) );
			y = y0 + rHole * Math.sin( alpha );
			z0 = rHole * Math.cos( alpha );
			 
			// rotate around y axis 
			x = x0 * Math.cos( phi ) - z0 * Math.sin( phi );
			z = -x0 * Math.sin( phi ) - z0 * Math.cos( phi );
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			xmin = x < xmin ? x : xmin;
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function checkDistancesToUnite( m ) { // for new active front points
		
		let idxJ, xChk, yChk, zChk, ddUnite;
		let ddUniteMin = Infinity;
		unite = false;
		
		for ( let i = 0; i < insertFront.length; i ++ ) {
			
			getPoint( m + i );
			
			for ( let f = 0; f < fronts.length; f ++ ) {
				
				if ( f !== frontNo ) {
					
					xChk = ( xp > boundings[ f ][ 0 ] - g.d ) && ( xp < boundings[ f ][ 3 ] + g.d );
					yChk = ( yp > boundings[ f ][ 1 ] - g.d ) && ( yp < boundings[ f ][ 4 ] + g.d );
					zChk = ( zp > boundings[ f ][ 2 ] - g.d ) && ( zp < boundings[ f ][ 5 ] + g.d );
					
					if (  xChk || yChk || zChk ) {
						
						for ( let j = 0; j < fronts[ f ].length; j ++ ) {
							
							idxJ = fronts[ f ][ j ].idx * 3;
							
							// Hint: here (2) is exceptionally point in other front!
							x2 = g.positions[ idxJ ];
							y2 = g.positions[ idxJ + 1 ];
							z2 = g.positions[ idxJ + 2 ];
							
							ddUnite = squareLength ( x2 - xp, y2 - yp, z2 - zp );
							
							if ( ddUnite < dd && ddUnite < ddUniteMin ) {
								
								ddUniteMin = ddUnite;
								iUnite = i;
								jUnite = j;
								fUnite = f;
								unite = true;
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function uniteFront( m, i, f, j ) {
		
		let tmp = [];
		
		tmp[ 0 ] = front.slice( 0, m + i + 1 );	
		tmp[ 1 ] = fronts[ f ].slice( j , fronts[ f ].length );
		tmp[ 2 ] = fronts[ f ].slice( 0 , j + 1 );
		tmp[ 3 ] = front.slice( m + i, front.length );
		
		unionIdxA = m + i;
		unionIdxB = m + i + 1 + fronts[ f ].length
		
		front = [];
		
		for ( let t = 0; t < 4; t ++ ) {
			
			for ( let k = 0; k < tmp[ t ].length ; k ++ ) {
				
				front.push( tmp[ t ][ k ] );
				
			}
			
		}
		
		fronts[ f ] = []; // empty united front
		
		frontStock -= 1; // front is eliminated
		
	}
	
	function trianglesAtUnionPoints( ) {
		
		nIns = 0; // count inserted points
		
		calculateFrontAngle( unionIdxA );
		calculateFrontAngle( unionIdxA + 1 );
		
		if ( front[ unionIdxA ].ang < front[ unionIdxA + 1 ].ang ) {
			
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA + 1 + nIns );
			makeNewTriangles( unionIdxA + 1 + nIns );
			nIns += n - 1;
			
		} else {
			
			makeNewTriangles( unionIdxA + 1 );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA );
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
		}
		
		calculateFrontAngle( unionIdxB + nIns );
		calculateFrontAngle( unionIdxB + 1 + nIns );
		
		if ( front[ unionIdxB + nIns ].ang < front[ unionIdxB + 1 + nIns ].ang ) {
			
			makeNewTriangles( unionIdxB + nIns );
			nIns += n - 1;
			calculateFrontAngle( unionIdxB + 1 + nIns );
			makeNewTriangles( unionIdxB + 1 + nIns );
			
		} else {
			
			makeNewTriangles( unionIdxB + 1 + nIns );
			calculateFrontAngle( unionIdxB + nIns );
			makeNewTriangles( unionIdxB + nIns );
			
		}
		
	}
	
	function checkDistancesToSplit( m ) { // for new active front points
		
		let mj, mjIdx, ddSplit;
		let ddSplitMin = Infinity;
		split = false;
		
		for ( let i = 0; i < front.length ; i ++ ) {
			
			for ( let j = 0; j < n; j ++ ) { // check n new points (insertFront)
			
				mj = m + j;
				
				// except new points themselves and neighbor points
				if ( Math.abs( i - mj ) > 3 && Math.abs( i - mj ) < front.length - 3 ) {
					
					mjIdx = front[ mj ].idx * 3;
					
					// Hint: here (1) is exceptionally new point in the front!
					x1 = g.positions[ mjIdx ]; 
					y1 = g.positions[ mjIdx + 1 ];
					z1 = g.positions[ mjIdx + 2 ];
					
					getPoint( i );
					
					ddSplit = squareLength ( x1 - xp, y1 - yp, z1 - zp );
					
					if ( ddSplit < dd && ddSplit < ddSplitMin ) {
						
						ddSplitMin = ddSplit;
						iSplit = i;
						jSplit = mj;
						split = true; 
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function splitFront( iSplit, jSplit ) {
		
		let k;
		
		front[ iSplit ].ang = 0;
		front[ jSplit ].ang = 0;
		
		if ( iSplit > jSplit )  { // swap
			
			k = jSplit;
			jSplit = iSplit;
			iSplit = k;
			
		} 
		
		splitIdx = iSplit;	// lower index
		
		partFront = [];
		
		// to duplicate
		let frontI = front[ iSplit ];
		let frontJ = front[ jSplit ];
		
		partFront = front.splice( iSplit + 1, jSplit - iSplit - 1 );
		partFront.unshift( frontI );
		partFront.push( frontJ );
		
		fronts.push( partFront );
		
		partFrontBounds( );
		
		frontStock += 1; // new front created
		
	}
	
	function trianglesAtSplitPoints( ) {
		
		nIns = 0; // count inserted points
		
		let idx0 = splitIdx; // splitIdx is the lower index 
		let idx1 = splitIdx + 1;
		
		calculateFrontAngle( idx0 );
		calculateFrontAngle( idx1 );
		
		if ( front[ idx1 ].ang < front[ idx0 ].ang ){
			
			makeNewTriangles( idx1 );
			nIns += n - 1;
			calculateFrontAngle( idx0 );
			makeNewTriangles( idx0 );
			
		} else {
			
			makeNewTriangles( idx0 );
			nIns += n - 1;
			calculateFrontAngle( idx1 + nIns );
			makeNewTriangles( idx1 + nIns );
			
		}
		
	}
	
	function getMinimalAngleIndex( ) {
		
		let angle = Infinity;
		let m;
		
		for ( let i = 0; i < front.length; i ++ ) {
			
			if( front[ i ].ang < angle  ) {
				
				angle = front[ i ].ang ;
				m = i;
				
			}
			
		}
		
		return m;
		
	}
	
	function makeNewTriangles( m ) {
		
		//	m:  minimal angle (index)
		
		insertFront = []; // new front points
		
		nT = Math.floor( 3 * front[ m ].ang / Math.PI ) + 1; // number of new triangles
		
		dAng = front[ m ].ang / nT;
		
		getSystemAtPoint( m );
		getNextPoint( m );
		
		d1 = length( x1 - xp, y1 - yp, z1 - zp );
		d2 = length( x2 - xp, y2 - yp, z2 - zp );
		d12 = length( x2 - x1, y2 - y1, z2 - z1 );
		
		// correction of dAng, nT in extreme cases
		
		if ( dAng < 0.8 && nT > 1 ) {
			
			nT --;
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( dAng > 0.8 && nT === 1 && d12 > 1.25 * g.d ) {
			
			nT = 2; 
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( d1 * d1 < 0.2 * dd ||  d2 * d2 < 0.2 * dd  ) {
			
			nT = 1;
			
		}
		
		n = nT - 1;  // n number of new points
			
		if ( n === 0 ) { // one triangle
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx; 
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	// stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			front[ nextFront( m ) ].ang = 0;
			
			front.splice( m, 1 ); // delete point with index m from the front
			
		} else { // more then one triangle
			
			xc = xp;
			yc = yp;
			zc = zp;
			
			for ( let i = 0,  phi = dAng; i < n; i ++, phi += dAng ) {
				
				xp = xc + Math.cos( phi ) * g.d * xt1 + Math.sin( phi ) * g.d * xt2; 
				yp = yc + Math.cos( phi ) * g.d * yt1 + Math.sin( phi ) * g.d * yt2;
				zp = zc + Math.cos( phi ) * g.d * zt1 + Math.sin( phi ) * g.d * zt2;
				
				len = lenXZ( xp, zp );   // to bring the point to the surface (radius * ..)
				
				g.positions[ posIdx     ] = g.radius * xp / len;
				g.positions[ posIdx + 1 ] = yp;
				g.positions[ posIdx + 2 ] = g.radius * zp / len;
				
				insertFront.push( { idx: posIdx / 3, ang: 0 } );
				
				posIdx += 3;
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx;
			g.indices[ indIdx + 2 ] = insertFront[ 0 ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG  triangles  /////////////////////
		 	// stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			
			for ( let i = 0; i < n - 1; i ++ ) {
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = insertFront[ i ].idx;
				g.indices[ indIdx + 2 ] = insertFront[ i + 1 ].idx;
				
				indIdx += 3;
				
				///////////////  DEBUG triangles  //////////////////////
				// stp ++;
				////////////////////////////////////////////////////////
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = insertFront[ n - 1 ].idx;
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			front[ nextFront( m ) ].ang = 0;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	// stp ++;
			////////////////////////////////////////////////////////
			
			replaceFront( m, insertFront ); // replaces front[ m ] with new points
			
		}
		
	}
	
	function makeLastTriangle( ) {
		
		g.indices[ indIdx     ] = front[ 2 ].idx;
		g.indices[ indIdx + 1 ] = front[ 1 ].idx 
		g.indices[ indIdx + 2 ] = front[ 0 ].idx;
		
		indIdx += 3;
		
		///////////////  DEBUG triangles  //////////////////////
	 	// stp ++;
		////////////////////////////////////////////////////////
		
		front = [];
		
		fronts[ frontNo ] = [];
		
		frontStock -= 1; // close front
		
	}
	
	function chooseNextFront( ) {
		
		if ( frontStock > 0 ) {
			
			for ( let i = 0; i < fronts.length; i ++ ) {
				
				if ( fronts[ i ].length > 0 ) {
					
					frontNo = i;
					break;
					
				}
				
			}
			
			front = fronts[ frontNo ];
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				calculateFrontAngle( i ); // recalculate angles of next front
				
			}
			
		}
		
	}
	
	function atan2PI( x, y ) {
		
		let phi = Math.atan2( y, x );
		
		if ( phi < 0 ) phi = phi + Math.PI * 2;
		
		return phi;
		
	}
	
	function coordTangentialSystem( ) {
		
		let det = detYc0( xt1, yt1, zt1, xt2, yt2, zt2, xn, zn ); // cylinder:  yn=yc=0
		
		xs1 = detYc0( x1 - xp, y1 - yp, z1 - zp, xt2, yt2, zt2, xn, zn ) / det;
		ys1 = detYc0( xt1, yt1, zt1, x1 - xp, y1 - yp, z1 - zp, xn, zn ) / det;
		//zs1  not needed
		
		xs2 = detYc0( x2 - xp, y2 - yp, z2 - zp, xt2, yt2, zt2, xn, zn ) / det;
		ys2 = detYc0( xt1, yt1, zt1, x2 - xp, y2 - yp, z2 - zp, xn, zn ) / det;
		//zs2 not needed
		
	}
	
	function calculateFrontAngle( i ) {
		
		let ang1, ang2;
		
		getSystemAtPoint( i );
		getNextPoint( i );
		
		coordTangentialSystem( );
		
		ang1 = atan2PI( xs1, ys1 );
		ang2 = atan2PI( xs2, ys2 );
		
		if ( ang2 < ang1 )  ang2 += Math.PI * 2;
		
		front[ i ].ang  = ang2 - ang1;
		
		if ( front[ i ].ang < 1.5 ) smallAngles.push( i );
		
	}
	
	function partFrontBounds( ) {
		
		let idx, xmin, ymin, zmin, xmax, ymax, zmax;
		
		partBounds = [];
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		for( let i = 0; i < partFront.length; i ++ ) {
			
			idx = partFront[ i ].idx * 3;
			
			x = g.positions[ idx ]; 
			y = g.positions[ idx + 1 ];
			z = g.positions[ idx + 2 ];
			
			xmin = x < xmin ? x : xmin; 
			ymin = y < ymin ? y : ymin;
			zmin = z < zmin ? z : zmin;
			
			xmax = x > xmax ? x : xmax;
			ymax = y > ymax ? y : ymax;
			zmax = z > zmax ? z : zmax;
			
		}
		
		partBounds.push( xmin, ymin, zmin, xmax, ymax, zmax );
		
		boundings.push( partBounds );
		
	}
	
	function replaceFront( m, fNew ) {
		
		let rear = front.splice( m, front.length - m );
		
		for ( let i = 0; i < fNew.length; i ++ ) {
			
			front.push( fNew[ i ] ); // new front points
			
		}
		
		for ( let i = 1; i < rear.length; i ++ ) { // i = 1: without old front point m 
			
			front.push( rear[ i ] );
			
		}
		
	}
	
	function getSystemAtPoint( i ) {
		
		getPrevPoint( i );
		getPoint( i );
		
		len = lenXZ( xp, zp );
		xn = xp / len;
		zn = zp / len;
		
		// cross,  cylinder:  yn=0
		
		xt2 = -zn * ( y1 - yp );
		yt2 = zn * ( x1 - xp ) - xn * ( z1 - zp );
		zt2 = xn * ( y1 - yp );
		
		len = length( xt2, yt2, zt2 ); // to normalize
		
		xt2 = xt2 / len;
		yt2 = yt2 / len;
		zt2 = zt2 / len;
		
		// cross
		xt1 = yt2 * zn;
		yt1 = zt2 * xn - xt2 * zn;
		zt1 = -yt2 * xn;
		
	}
	
	function getPrevPoint( i ) {
		
		frontPosIdx = front[ prevFront( i ) ].idx * 3;
		
		x1 = g.positions[ frontPosIdx ];
		y1 = g.positions[ frontPosIdx + 1 ];
		z1 = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getPoint( i ) {
		
		frontPosIdx = front[ i ].idx * 3;
		
		xp = g.positions[ frontPosIdx ];
		yp = g.positions[ frontPosIdx + 1 ];
		zp = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getNextPoint( i ) {
		
		frontPosIdx = front[ nextFront( i ) ].idx * 3;
		
		x2 = g.positions[ frontPosIdx ];
		y2 = g.positions[ frontPosIdx + 1 ];
		z2 = g.positions[ frontPosIdx + 2 ];
		
	}
	
}

exports.createCylinderWithHoles = createCylinderWithHoles;
exports.buildCylinderWithHoles = buildCylinderWithHoles;

// .............................. Inner Geometry (Triangulation) ....................................
// .................... combines sphere, cylinder and other - with holes ............................

function createInnerGeometry( p ) {
	
	g = this;  //  THREE.BufferGeometry() - geometry object from three.js
	
	g.surface = p.surface !== undefined ? p.surface : 'polygon';
	g.holes = p.holes !== undefined ? p.holes : [];
	
	parametersToSurface( ); // with defaults
	
	
	function parametersToSurface( ) {
			
		if ( g.surface === 'circle' || g.surface === 'sphere' ) {
			
			g.d = p.d !== undefined ? p.d : 2 * Math.sin( Math.PI / 24 ); // to g.div4 default
			g.div4 = p.div4 !== undefined ? p.div4 : 6; // 6 * 4 = 24 circle divisions
			
			g.detail = g.div4 * 4; // division of the great circle
			g.radius = g.d / Math.sin( Math.PI / g.detail ) / 2; // radius, for external use as well
			
		}
		
		if ( g.surface === 'polygon' ) {
			
			g.d = p.d !== undefined ? p.d : 0.1;
			g.polygonN = p.polygonN !== undefined ? p.polygonN : 6;
			g.divN = p.divN !== undefined ? p.divN : 10;
			
			g.detail = g.polygonN * g.divN;
			g.radius = g.d * g.divN / Math.sin( Math.PI / g.polygonN ) / 2; // radius, for external use as well
		
		}
		
		if ( g.surface === 'rectangle' ) {
		
			g.d = p.d !== undefined ? p.d : 0.1;
			g.divW = p.divW !== undefined ? p.divW : 10;
			g.divH = p.divH !== undefined ? p.divH : 10;
			
			g.detail = (g.divW + g.divH ) * 2;
			
		}
		
		if ( g.surface === 'outline' ) {
			
			g.d = p.d !== undefined ? p.d : 0.1;
			g.points = p.points !== undefined ? p.points : [ 1,1, -1,1, -1,-1,  1,-1 ];
			
			g.detail = 8 / g.d;
			
		}
		
		if ( g.surface === 'planecap' ) { // ellipse (circle) as bottom or top of a tilted (0) cut cylinder
			
			g.d = p.d !== undefined ? p.d : 2 * Math.sin( Math.PI / 24 ); // to g.div4 default
			g.div4 = p.div4 !== undefined ? p.div4 : 6; // 6 * 4 = 24  divisions of associated cylinder
			g.tilt = p.tilt !== undefined ? p.tilt : 0; // tilt of adaption to the associated cylinder
			g.cap = p.cap !== undefined ? p.cap : 'btm';  // orientation for bottom
			
			g.detail = g.div4 * 4; // division of the associated cylinder circle
			g.radius = g.d / Math.sin( Math.PI / g.detail ) / 2; // equals ellipse minor semi-axis b for external use as well
			g.major = g.radius / Math.cos( g.tilt )  // ellipse major semi-axis a for external use as well
			g.sintilt = Math.sin( g.tilt );
			g.costilt = Math.cos( g.tilt );
			
		}	
			
		if ( g.surface === 'cylinder' ) {
			
			g.d = p.d !== undefined ? p.d : 2 * Math.sin( Math.PI / 24 ); // to g.div4 default
			g.div4 = p.div4 !== undefined ? p.div4 : 6; // 6 * 4 = 24 circle divisions
			
			// bottom
			g.geoBtm = p.geoBtm !== undefined ? p.geoBtm : 'plane';
			g.btm = p.btm !== undefined ? p.btm : -1; // y Min
			g.div4Btm = p.div4Btm !== undefined ? p.div4Btm : Number.MAX_SAFE_INTEGER;
			g.phiBtm = p.phiBtm !== undefined ? p.phiBtm : 0; // rotation of adaptation
			g.excBtm = p.excBtm !== undefined ? p.excBtm : 0; // excenter of adaptation
			g.excUnitBtm = p.excUnitBtm !== undefined ? p.excUnitBtm : 'v'; // excenter unit
			g.tiltBtm = p.tiltBtm !== undefined ? p.tiltBtm : 0; // tilt of adaption
			
			// top
			g.geoTop = p.geoTop !== undefined ? p.geoTop : 'plane';
			g.top = p.top !== undefined ? p.top : 1; // y Max
			g.div4Top = p.div4Top !== undefined ? p.div4Top : Number.MAX_SAFE_INTEGER;
			g.phiTop = p.phiTop !== undefined ? p.phiTop : 0; // rotation of adaptation
			g.excTop = p.excTop !== undefined ? p.excTop : 0; // excenter of adaptation
			g.excUnitTop = p.excUnitTop !== undefined ? p.excUnitTop : 'v'; // excenter unit
			g.tiltTop = p.tiltTop !== undefined ? p.tiltTop : 0; // tilt of adaption
			
			g.detail = g.div4 * 4; // division of the circle
			g.radius = g.d / Math.sin( Math.PI / g.detail ) / 2; // radius, for external use as well
			
		}
		
	}
	
	g.buildInnerGeometry = buildInnerGeometry;
	g.buildInnerGeometry( );
	
}

function buildInnerGeometry( p ) {
	
	const dd = g.d * g.d;
	
	const squareLength = ( x,y,z ) => ( x*x + y*y + z*z );
	const length = ( x, y, z ) => ( Math.sqrt( x * x + y * y + z * z ) );
	const lenXZ = ( x, z ) => ( Math.sqrt( x * x + z * z ) );
	const prevFront = ( i ) => ( i !== 0 ? i - 1 : front.length - 1 );
	const nextFront  = ( i ) => ( i !== front.length - 1 ? i + 1 : 0 );
	const determinant = ( xa,ya,za, xb,yb,zb, xc,yc,zc ) => ( xa*yb*zc + ya*zb*xc + za*xb*yc - za*yb*xc - xa*zb*yc - ya*xb*zc );
	
	let m; // index of the current front point
	let n; // number of new points
	let nT; // number of new triangles
	let nIns; // number of new points (after union or split)
	let dAng; // partial angle
	let len, d1, d2, d12; // lengths
	let iSplit, jSplit; // split front indices  
	let iUnite, jUnite, fUnite; // unite front indices, front number (to unite) 
	
	// points and vectors
	let x, y, z, xp, yp, zp; // coordinates point and actual point p
	let x1, y1, z1, x2, y2, z2; // previous and next point to p in front
	let xn, yn, zn; // normal, gradient
	let xt1, yt1, zt1, xt2, yt2, zt2; // tangents
	let xs1, ys1, xs2, ys2; // p in tangential system (only x, y required)
	let xc, yc, zc; // actual point as center point for new points
	
	// for boundaries and holes 
	let xmin, ymin, zmin, xmax, ymax, zmax; // for bounding boxes
	let x0, y0, z0, x11, y11, z11; // points to memorize
	let xa, ya, za, xb, yb; // actual point p for rotation around axes
	let dx, dy, dz, dyzdx, dxzdy, sqlen0, sqlen1, posLen, h; // vector, length
	let theta, phi, psi, psi0, dpsi, psiBound, psiStart, psiEnd, sinpsi, cospsi, tilt, sintilt, costilt, tantilt; // angles
	let yOff, exc; // parameter
	let count, side, sign, reverseOrder, endPoint, slope, r0,r1, dsc, rex, connected, unit, t; ; // calculation interim values
	
	//  preparation
	
	const faceCount = g.detail * g.detail * 30 ;
	const posCount  = g.detail * g.detail * 20 ;
	
	g.indices = new Uint32Array( faceCount * 3 );
	g.positions = new Float32Array( posCount * 3 );
	
	g.setIndex( new THREE.BufferAttribute( g.indices, 1 ) );
	g.setAttribute( 'position', new THREE.BufferAttribute( g.positions, 3 ) );
	
	let posIdx = 0;
	let indIdx = 0;
	let frontPosIdx, unionIdxA, unionIdxB, splitIdx;
	
	let front = []; // active front // front[ i ]: object { idx: 0, ang: 0 }
	let partFront = []; // separated part of the active front (to split)
	let insertFront = []; // new front points to insert into active front
	let fronts = []; // all fronts
	let partBounds = []; // bounding box of partFront [ xmin, ymin, zmin, xmax, ymax, zmax ]
	let boundings = []; // fronts bounding boxes
	let smallAngles = []; // new angles < 1.5
	
	let outline = []; // for plane surfaces
	let pos = []; // hole and boundaries positions during calculation
	
	let frontNo, frontStock;
	let unite = false;
	let split = false;
	
	frontNo = 0; // active front number
	frontStock = 0; // number of fronts still to be processed
	
	defineBoundsAndHoles( );
	
	if ( frontStock === 0 ) makeFirstTriangle( );
	
	frontNo = 0; // active front number initial again
	
	front = fronts[ frontNo ];
	
	//////////////////  DEBUG triangles //////////////////////////////////
	let stp = 0;
	//////////////////////////////////////////////////////////////////////

	// ------ triangulation cycle -------------
	
	while ( frontStock > 0 ) {
		
		if (  !unite && !split ) { // triangulation on the front
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				if( front[ i ].ang === 0 ) calculateFrontAngle( i ); // is to be recalculated (angle was set to zero)
				
			}
			
			m = getMinimalAngleIndex( ); // front angle
			makeNewTriangles( m );
			
			if ( front.length > 9 && smallAngles.length === 0 ) {
				
				checkDistancesToUnite( m );
				checkDistancesToSplit( m );
				
			}
			
			if ( front.length === 3 ) {
				
				makeLastTriangle( ); // last triangle closes the front
				chooseNextFront( ); // if aviable
				
			}
			
		} else { // unite the active front to another front or split the active front
			
			if ( unite ) {
				
				uniteFront(  m, iUnite, fUnite, jUnite );
				trianglesAtUnionPoints( );
				unite = false;
				
			} else if ( split ) {
				
				splitFront( iSplit, jSplit );
				trianglesAtSplitPoints( );
				split = false;
				
			}
			
		}
		
		/////////// DEBUG triangles ///////////////////////////////////////////////////////////////
		// if ( stp > 100 ) break;	
		///////////////////////////////////////////////////////////////////////////////////////////
		
	}
	
	// .....  detail functions .....

	function makeFirstTriangle ( ) {
	
		 // needed because no bounds
		 
		switch ( g.surface ) {
			
			case 'sphere':
			
			fronts[ frontNo ] = [];
			boundings[ frontNo ] = [];
			
			storeSpherePoint( 0, 0 ); // ( theta, phi )
			storeSpherePoint( Math.PI / 2 / g.div4, -Math.PI / 6 );
			storeSpherePoint( Math.PI / 2 / g.div4,  Math.PI / 6 );
			
			g.indices[ 0 ] = 0;
			g.indices[ 1 ] = 1; 
			g.indices[ 2 ] = 2;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
			// stp ++;
			////////////////////////////////////////////////////////
			
			fronts[ frontNo ].push( { idx: 0, ang: 0 }, { idx: 1, ang: 0 }, { idx: 2, ang: 0 } );
			
			frontNo ++;
			frontStock ++;
			
			break;
			/*
			case 'torus':
			
			break;
			*/
			
		}
		
	}
	
	function storeSpherePoint( theta, phi ) {
		
		g.positions[ posIdx     ] = g.radius * Math.sin( theta ) * Math.cos( phi );
		g.positions[ posIdx + 1 ] = g.radius * Math.cos( theta );
		g.positions[ posIdx + 2 ] = -g.radius * Math.sin( theta ) * Math.sin( phi );
		
		posIdx += 3;
		
	}
	
	// triangulation functions
	
	function checkDistancesToUnite( m ) { // for new active front points
		
		let idxJ, xChk, yChk, zChk, ddUnite;
		let ddUniteMin = Infinity;
		unite = false;
		
		for ( let i = 0; i < insertFront.length; i ++ ) {
			
			getPoint( m + i );
			
			for ( let f = 0; f < fronts.length; f ++ ) { 
				
				if ( f !== frontNo ) {
					
					xChk = ( xp > boundings[ f ][ 0 ] - g.d ) && ( xp < boundings[ f ][ 3 ] + g.d );
					yChk = ( yp > boundings[ f ][ 1 ] - g.d ) && ( yp < boundings[ f ][ 4 ] + g.d );
					zChk = ( zp > boundings[ f ][ 2 ] - g.d ) && ( zp < boundings[ f ][ 5 ] + g.d );
					
					if (  xChk || yChk || zChk ) {
						
						for ( let j = 0; j < fronts[ f ].length; j ++ ) {
							
							idxJ = fronts[ f ][ j ].idx * 3;
							
							// Hint: here (2) is exceptionally point in other front!
							x2 = g.positions[ idxJ ]; 
							y2 = g.positions[ idxJ + 1 ];
							z2 = g.positions[ idxJ + 2 ];
							
							ddUnite = squareLength ( x2 - xp, y2 - yp, z2 - zp );
							
							if ( ddUnite < dd && ddUnite < ddUniteMin ) {
								
								ddUniteMin = ddUnite; 
								iUnite = i;
								jUnite = j;
								fUnite = f;
								unite = true;
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function uniteFront( m, i, f, j ) {
		
		let tmp = [];
		
		tmp[ 0 ] = front.slice( 0, m + i + 1 );
		tmp[ 1 ] = fronts[ f ].slice( j , fronts[ f ].length );
		tmp[ 2 ] = fronts[ f ].slice( 0 , j + 1 );
		tmp[ 3 ] = front.slice( m + i, front.length );
		
		unionIdxA = m + i;
		unionIdxB = m + i + 1 + fronts[ f ].length
		
		front = [];
		
		for ( let t = 0; t < 4; t ++ ) {
			
			for ( let k = 0; k < tmp[ t ].length ; k ++ ) {
				
				front.push( tmp[ t ][ k ] );
				
			}
			
		}
		
		fronts[ f ] = []; // empty united front
		
		frontStock -= 1; // front is eliminated
		
	}
	
	function trianglesAtUnionPoints( ) {
		
		nIns = 0; // count inserted points
		
		calculateFrontAngle( unionIdxA );
		calculateFrontAngle( unionIdxA + 1 );
		
		if ( front[ unionIdxA ].ang < front[ unionIdxA + 1 ].ang ) {
			
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA + 1 + nIns );
			makeNewTriangles( unionIdxA + 1 + nIns );
			nIns += n - 1;
			
		} else {
			
			makeNewTriangles( unionIdxA + 1 );
			nIns += n - 1;
			calculateFrontAngle( unionIdxA );
			makeNewTriangles( unionIdxA );
			nIns += n - 1;
		}
		
		calculateFrontAngle( unionIdxB + nIns );
		calculateFrontAngle( unionIdxB + 1 + nIns );
		
		if ( front[ unionIdxB + nIns ].ang < front[ unionIdxB + 1 + nIns ].ang ) {
			
			makeNewTriangles( unionIdxB + nIns );
			nIns += n - 1;
			calculateFrontAngle( unionIdxB + 1 + nIns );
			makeNewTriangles( unionIdxB + 1 + nIns );
			
		} else {
			
			makeNewTriangles( unionIdxB + 1 + nIns );
			calculateFrontAngle( unionIdxB + nIns );
			makeNewTriangles( unionIdxB + nIns );
			
		}
		
	}
	
	function checkDistancesToSplit( m ) { // for new active front points
	
		let mj, mjIdx, ddSplit;
		let ddSplitMin = Infinity;
		split = false;
		
		for ( let i = 0; i < front.length ; i ++ ) {
			
			for ( let j = 0; j < n; j ++ ) { // check n new points (insertFront)
				
				mj = m + j;
				
				// except new points themselves and neighbor points
				if ( Math.abs( i - mj ) > 3 && Math.abs( i - mj ) < front.length - 3 ) {
					
					mjIdx = front[ mj ].idx * 3;
					
					// Hint: here (1) is exceptionally new point in the front!
					x1 = g.positions[ mjIdx ]; 
					y1 = g.positions[ mjIdx + 1 ];
					z1 = g.positions[ mjIdx + 2 ];
					
					getPoint( i );
					
					ddSplit = squareLength ( x1 - xp, y1 - yp, z1 - zp );
					
					if ( ddSplit < dd && ddSplit < ddSplitMin ) {
						
						ddSplitMin = ddSplit;
						iSplit = i;
						jSplit = mj;
						split = true;
						
					}
					
				}
				
			}
			
		}
		
	}
	
	function splitFront( iSplit, jSplit ) {
		
		let k;
		
		front[ iSplit ].ang = 0;
		front[ jSplit ].ang = 0;
		
		if ( iSplit > jSplit )  { // swap
			
			k = jSplit;
			jSplit = iSplit;
			iSplit = k;
			
		} 
		
		splitIdx = iSplit;	// lower index
		
		partFront = [];
		
		// to duplicate
		let frontI = front[ iSplit ];
		let frontJ = front[ jSplit ];
		
		partFront = front.splice( iSplit + 1, jSplit - iSplit - 1 );
		partFront.unshift( frontI );
		partFront.push( frontJ );
		
		fronts.push( partFront );
		
		partFrontBounds( );
		
		frontStock += 1; // new front created
		
	}
	
	function trianglesAtSplitPoints( ) {
		
		nIns = 0; // count inserted points
		
		let idx0 = splitIdx; // splitIdx is the lower index
		let idx1 = splitIdx + 1;
		
		calculateFrontAngle( idx0 );
		calculateFrontAngle( idx1 );
		
		if ( front[ idx1 ].ang < front[ idx0 ].ang ){
			
			makeNewTriangles( idx1 );
			nIns += n - 1;
			calculateFrontAngle( idx0 );
			makeNewTriangles( idx0 );
			
		} else {
			
			makeNewTriangles( idx0 );
			nIns += n - 1;
			calculateFrontAngle( idx1 + nIns );
			makeNewTriangles( idx1 + nIns );
			
		}
		
	}
	
	function getMinimalAngleIndex( ) {
		
		let angle = Infinity;
		let m;
		
		for ( let i = 0; i < front.length; i ++ ) {
			
			if( front[ i ].ang < angle  ) {
				
				angle = front[ i ].ang ;
				m = i;
				
			}
			
		}
		
		return m;
		
	}
	
	function makeNewTriangles( m ) {
		
		//	m:  minimal angle (index)
		
		insertFront = []; // new front points
		
		nT = Math.floor( 3 * front[ m ].ang / Math.PI ) + 1; // number of new triangles
		
		dAng = front[ m ].ang / nT;
		
		getSystemAtPoint( m );
		getNextPoint( m );
		
		d1 = length( x1 - xp, y1 - yp, z1 - zp );
		d2 = length( x2 - xp, y2 - yp, z2 - zp );
		d12 = length( x2 - x1, y2 - y1, z2 - z1 );
		
		// correction of dAng, nT in extreme cases
		
		if ( dAng < 0.8 && nT > 1 ) {
			
			nT --;
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( dAng > 0.8 && nT === 1 && d12 > 1.25 * g.d ) {
			
			nT = 2; 
			dAng = front[ m ].ang / nT;
			
		}
		
		if ( d1 * d1 < 0.2 * dd ||  d2 * d2 < 0.2 * dd  ) {
			
			nT = 1;
			
		}
		
		n = nT - 1;  // n number of new points
			
		if ( n === 0 ) { // one triangle
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx; 
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
		 	 stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			front[ nextFront( m ) ].ang = 0;
			
			front.splice( m, 1 ); // delete point with index m from the front
			
		} else { // more then one triangle
			
			xc = xp;
			yc = yp;
			zc = zp;
			
			for ( let i = 0,  phi = dAng; i < n; i ++, phi += dAng ) {
				
				xp = xc + Math.cos( phi ) * g.d * xt1 + Math.sin( phi ) * g.d * xt2;
				yp = yc + Math.cos( phi ) * g.d * yt1 + Math.sin( phi ) * g.d * yt2;
				zp = zc + Math.cos( phi ) * g.d * zt1 + Math.sin( phi ) * g.d * zt2;
				
				surfacePoint( );
				
				insertFront.push( { idx: posIdx / 3, ang: 0 } );
				
				posIdx += 3;
				
			}	
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx 
			g.indices[ indIdx + 2 ] = insertFront[ 0 ].idx;
			
			indIdx += 3;
			
			///////////////  DEBUG  triangles  /////////////////////
			stp ++;
			////////////////////////////////////////////////////////
			
			front[ prevFront( m ) ].ang = 0;
			
			for ( let i = 0; i < n - 1; i ++ ) {
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = insertFront[ i ].idx;
				g.indices[ indIdx + 2 ] = insertFront[ i + 1 ].idx;
				
				indIdx += 3;
				
				///////////////  DEBUG triangles  //////////////////////
				 stp ++;
				////////////////////////////////////////////////////////
				
			}
			
			g.indices[ indIdx     ] = front[ m ].idx;
			g.indices[ indIdx + 1 ] = insertFront[ n - 1 ].idx;
			g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
			
			front[ nextFront( m ) ].ang = 0;
			
			indIdx += 3;
			
			///////////////  DEBUG triangles  //////////////////////
			stp ++;
			////////////////////////////////////////////////////////
			
			replaceFront( m, insertFront ); // replaces front[ m ] with new points
			
		}
		
	}
	
	function surfacePoint( ) {
		
		switch ( g.surface ) {
			
			case 'polygon':
			case 'outline':
			case 'rectangle':
			case 'circle':
			g.positions[ posIdx     ] = xp;
			g.positions[ posIdx + 1 ] = 0;
			g.positions[ posIdx + 2 ] = zp;
			break;
			
			case 'sphere':
			len = length( xp, yp, zp );
			g.positions[ posIdx     ] = g.radius * xp / len;
			g.positions[ posIdx + 1 ] = g.radius * yp / len;
			g.positions[ posIdx + 2 ] = g.radius * zp / len;
			break;
			
			case 'planecap':
			g.positions[ posIdx     ] = xp;
			g.positions[ posIdx + 1 ] = yp;
			g.positions[ posIdx + 2 ] = zp;
			break;
			
			case 'cylinder':
			len = lenXZ( xp, zp );
			g.positions[ posIdx     ] = g.radius * xp / len;
			g.positions[ posIdx + 1 ] = yp;
			g.positions[ posIdx + 2 ] = g.radius * zp / len;
			break;
			
		}
		
	}
	
	function makeLastTriangle( ) {
		
		g.indices[ indIdx     ] = front[ 2 ].idx;
		g.indices[ indIdx + 1 ] = front[ 1 ].idx 
		g.indices[ indIdx + 2 ] = front[ 0 ].idx;
		
		indIdx += 3;
		
		///////////////  DEBUG triangles  //////////////////////
		stp ++;
		////////////////////////////////////////////////////////
		
		front = [];
		
		fronts[ frontNo ] = [];
		
		frontStock -= 1; // close front
		
	}
	
	function chooseNextFront( ) {
		
		if ( frontStock > 0 ) {
			
			for ( let i = 0; i < fronts.length; i ++ ) {
				
				if ( fronts[ i ].length > 0 ) {
					
					frontNo = i;
					break;
					
				}
				
			}
			
			front = fronts[ frontNo ];
			
			smallAngles = [];
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				calculateFrontAngle( i ); // recalculate angles of next front
				
			}
			
		}
		
	}
	
	function atan2PI( x, y ) {
		
		let angle = Math.atan2( y, x );
		
		if ( angle < 0 ) angle = angle + Math.PI * 2;
		
		return angle;
		
	}
	
	function coordTangentialSystem( ) {
		
		let det = determinant( xt1, yt1, zt1, xt2, yt2, zt2, xn, yn, zn );
		
		xs1 = determinant( x1 - xp, y1 - yp, z1 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
		ys1 = determinant( xt1, yt1, zt1, x1 - xp, y1 - yp, z1 - zp, xn, yn, zn ) / det;
		//zs1  not needed
		
		xs2 = determinant( x2 - xp, y2 - yp, z2 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
		ys2 = determinant( xt1, yt1, zt1, x2 - xp, y2 - yp, z2 - zp, xn, yn, zn ) / det;
		//zs2 not needed
		
	}
	
	function calculateFrontAngle( i ) {
		
		let ang1, ang2;
		
		getSystemAtPoint( i );
		getNextPoint( i );
 		
		coordTangentialSystem( );
	 	
		ang1 = atan2PI( xs1, ys1 );
		ang2 = atan2PI( xs2, ys2 );	
		
		if ( ang2 < ang1 )  ang2 += Math.PI * 2;
		
		front[ i ].ang  = ang2 - ang1;
		
		if ( front[ i ].ang < 1.5 ) smallAngles.push( i );
		
	}
	
	function partFrontBounds( ) {
		
		let idx;
		
		partBounds = [];
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		for( let i = 0; i < partFront.length; i ++ ) {
			
			idx = partFront[ i ].idx * 3;
			minMaxValues( g.positions[ idx ], g.positions[ idx + 1 ], g.positions[ idx + 2 ] );
			
		}
		
		partBounds.push( xmin, ymin, zmin, xmax, ymax, zmax );
		
		boundings.push( partBounds );
		
	}
	
	function replaceFront( m, fNew ) {
		
		let rear = front.splice( m, front.length - m );
		
		for ( let i = 0; i < fNew.length; i ++ ) {
			
			front.push( fNew[ i ] ); // new front points
			
		}
		
		for ( let i = 1; i < rear.length; i ++ ) { // i = 1: without old front point m 
			
			front.push( rear[ i ] );
			
		}
		
	}
	
	function getSystemAtPoint( i ) {
		
		getPrevPoint( i );
		getPoint( i );
		
		switch ( g.surface ) {
			
			case 'polygon':
			case 'outline':
			case 'rectangle':
			case 'circle':
			
			xn = 0;
			yn = 1;
			zn = 0;
			
			// first tangent
			
			xt1 = x1 - xp;
			yt1 = 0;
			zt1 = z1 - zp;
			
			len = length( xt1, yt1, zt1 ); // to normalize
			
			xt1 = xt1 / len;
			yt1 = 0;
			zt1 = zt1 / len;
			
			// cross, ( xn, zn : 0, yn: 1 ) second tangent
			xt2 = zt1;
			yt2 = 0;
			zt2 = -xt1;
			
			break;
			
			case 'sphere':
			
			len = length( xp, yp, zp ); // to normalize
			
			xn = xp / len;
			yn = yp / len
			zn = zp / len;
			
			// centerAngle = Math.acos( Math.abs( x1 * xp + y1 * yp + z1 * zp ) / ( g.radius * g.radius ) );
			h = Math.abs( x1 * xp + y1 * yp + z1 * zp ) / g.radius; // distance: sphere center to cutting circle
			
			// center cutting circle (refers to previous point)
			xc = h / g.radius * xp; 
			yc = h / g.radius * yp;
			zc = h / g.radius * zp;
			
			// first tangent
			xt1 = x1 - xc;
			yt1 = y1 - yc;
			zt1 = z1 - zc;
			
			len = length( xt1, yt1, zt1 ); // to normalize
			
			xt1 = xt1 / len;
			yt1 = yt1 / len;
			zt1 = zt1 / len;
			
			// cross, second tangent
			
			xt2 = yn * zt1 - zn * yt1;
			yt2 = zn * xt1 - xn * zt1;
			zt2 = xn * yt1 - yn * xt1;
			 
			break;
			
			case 'planecap':
			
			xn = -g.sintilt;
			yn = g.costilt;
			zn = 0;
			
			// first tangent
			
			xt1 = x1 - xp;
			yt1 = y1 - yp;
			zt1 = z1 - zp;
			
			len = length( xt1, yt1, zt1 ); // to normalize
			
			xt1 = xt1 / len;
			yt1 = yt1 / len;
			zt1 = zt1 / len;
			
			// cross, second tangent
			
			xt2 = yn * zt1 - zn * yt1;
			yt2 = zn * xt1 - xn * zt1;
			zt2 = xn * yt1 - yn * xt1;
			
			break;
			
			case 'cylinder':
			
			len = lenXZ( xp, zp );
			
			xn = xp / len;
			yn = 0;
			zn = zp / len;
			
			// cross,  yn=0
			
			xt2 = -zn * ( y1 - yp );
			yt2 = zn * ( x1 - xp ) - xn * ( z1 - zp );
			zt2 = xn * ( y1 - yp );
			
			len = length( xt2, yt2, zt2 ); // to normalize
			
			xt2 = xt2 / len;
			yt2 = yt2 / len;
			zt2 = zt2 / len;
			
			// cross,  yn=0
			
			xt1 = yt2 * zn;
			yt1 = zt2 * xn - xt2 * zn;
			zt1 = -yt2 * xn;
			
			break;
			
		}
		
	}
	
	function getPrevPoint( i ) {
		
		frontPosIdx = front[ prevFront( i ) ].idx * 3;
		
		x1 = g.positions[ frontPosIdx ]; 
		y1 = g.positions[ frontPosIdx + 1 ];
		z1 = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getPoint( i ) {
		
		frontPosIdx = front[ i ].idx * 3;
		
		xp = g.positions[ frontPosIdx ];
		yp = g.positions[ frontPosIdx + 1 ];
		zp = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function getNextPoint( i ) {
		
		frontPosIdx = front[ nextFront( i ) ].idx * 3;
		
		x2 = g.positions[ frontPosIdx ];
		y2 = g.positions[ frontPosIdx + 1 ];
		z2 = g.positions[ frontPosIdx + 2 ];
		
	}
	
	function minMaxValues( x, y, z ) {
		 
		if ( x < xmin ) xmin = x;
		if ( y < ymin ) ymin = y;
		if ( z < zmin ) zmin = z;
		
		if ( x > xmax ) xmax = x;
		if ( y > ymax ) ymax = y;
		if ( z > zmax ) zmax = z;
		
	}
	
	// --- boundings and holes ---
	
	function defineBoundsAndHoles( ) {
		
		// define outline front for circle
		
		if ( g.surface === 'circle' ) {
		
			initFront( );
			
			for ( let j = 0, psi = 0; j < g.detail; j ++, psi += Math.PI * 2 / g.detail ) {
				
				x = g.radius * Math.cos( psi );
				y = 0;	
				z = g.radius * Math.sin( psi );
				
				g.positions[ posIdx     ] = x;
				g.positions[ posIdx + 1 ] = y;
				g.positions[ posIdx + 2 ] = z;
				
				fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
				
				minMaxValues( x, y, z );
				
				posIdx += 3;
				
			}
			
			boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
			
			frontNo ++;
			frontStock ++;
			
		}
				
		// define outline front for polygon
		
		if ( g.surface === 'polygon' ) {
			
			for ( let j = 0, psi = 0; j < g.polygonN; j ++, psi += Math.PI * 2 / g.polygonN ) {
				
				outline.push( g.radius * Math.cos( psi ), g.radius * Math.sin( psi ) );
				
			}
			
			makePointsFront( -1 ); // outline: parameter -1
			
		}
		
		// define outline front for rectangle
		
		if ( g.surface === 'rectangle' ) {
			
			x0 = g.divW * g.d / 2;
			z0 = g.divH * g.d / 2;
			
			outline = [  x0, z0,  -x0, z0,  -x0, -z0,   x0, -z0  ];
			
			makePointsFront( -1 ); // outline: parameter -1
			
		}

		// define front for surface: 'outline'
		
		if ( g.surface === 'outline' ) {
			
			outline = g.points;
			
			makePointsFront( -1 ); // outline: parameter -1
			
		}
				

		// define holes fronts for polygon, circle, rectangle, outline
		
		if (  g.surface === 'circle' || g.surface === 'polygon' || g.surface === 'rectangle' || g.surface === 'outline' ) {
			
			for ( let i = 0; i < g.holes.length; i ++ ) {
			
				if ( g.holes[ i ][ 0 ] === 'circle' ) { 
					
					// circular hole, [ 'circle', div4Adp, x, z ]
					
					r0 = g.d / Math.sin( Math.PI / g.holes[ i ][ 1 ] / 4 ) / 2; // radius
					
					initFront( );
					
					for ( let j = 0, psi = Math.PI * 2; j < g.holes[ i ][ 1 ] * 4; j ++, psi -= Math.PI / g.holes[ i ][ 1 ] / 2 ) {
						
						x = r0 * Math.cos( psi ) + g.holes[ i ][ 2 ];
						y = 0;	
						z = r0 * Math.sin( psi ) + g.holes[ i ][ 3 ];
						
						g.positions[ posIdx     ] = x;
						g.positions[ posIdx + 1 ] = y;
						g.positions[ posIdx + 2 ] = z;
						
						fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
						
						minMaxValues( x, y, z );
						
						posIdx += 3;
						
					}
					
					boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
					
					frontNo ++;
					frontStock ++;					
							
					
				} else	if ( g.holes[ i ][ 0 ] === 'polygon' ) {
					
					// polygonal hole, [ 'polygon', polygonNAdp, divNAdp, x, z ],
									
					r0 =  g.d * g.holes[ i ][ 2 ] / Math.sin( Math.PI / g.holes[ i ][ 1 ] ) / 2; // radius
					
					for ( let j = 0, psi = Math.PI * 2 ; j < g.holes[ i ][ 1 ]; j ++, psi -= Math.PI * 2 / g.holes[ i ][ 1 ] ) {
					
						outline.push( r0 * Math.cos( psi ) + g.holes[ i ][ 3 ], r0 * Math.sin( psi ) + g.holes[ i ][ 4 ] );
					
					}
				
					makePointsFront( -1 ); // outline: parameter -1
					
					
				} else if ( g.holes[ i ][ 0 ] === 'rectangle' ) {
					
					// rectangle hole, [ 'rectangle', divWAdp, divHAdp, x, z ]
					
					x0 = g.holes[ i ][ 1 ] * g.d / 2;
					z0 = g.holes[ i ][ 2 ] * g.d / 2;
					
					x11 = g.holes[ i ][ 3 ];
					z11 = g.holes[ i ][ 4 ];
					
 					outline = [ x0 + x11, -z0 + z11,  -x0 + x11, -z0 + z11,  -x0 + x11, z0 + z11,  x0 + x11, z0 + z11 ];
					
					makePointsFront( -1 ); // outline: parameter -1
					
				} else {
					
					makePointsFront( i ); // points: [ x, z, ... ]
				
				}
				
			}
			
		}
		
		// define holes fronts for sphere
		
		if ( g.surface === 'sphere' ) {
			
			g.circles = []; // array of arrays [ div4Adp,  xc, yc, zc, rAdp ], values for external use
			
			for ( let i = 0; i < g.holes.length; i ++ ) {
				
				if ( g.holes[ i ][ 0 ] === 'circle' ) {
					
					sphere_makeCircularHole( i );  // [ 'circle', div4Adp, theta, phi ]
					
				} else if ( g.holes[ i ][ 0 ] === 'cylinder' ) {
					
					sphere_makeCylinderHole( i ); // [ 'cylinder', div4Adp, theta, phi, exc, unit, <optional: side> ] 
					
				} else {
					
					makePointsFront( i ); // points: [ theta, phi, ... ]
					
				}
				
			}
			
		}
		
		// define outline front for tilt planecap for cylinder 
		
		if ( g.surface === 'planecap' ) {
			
			tilt = g.tilt;
			
			sign =  -1;
			
			yOff = 0; //don't change, place the planecap mesh instead
			phi = 0; //	don't change, rotate the planecap mesh instead
			
			cylinder_makePlaneBound( );
			
		}
		
		// define fronts for cylinder boundaries y-axis and holes
		
		if ( g.surface === 'cylinder' ) {
	 		
			// boundaries
			yOff = g.btm;
			g.div4Adp = g.div4Btm;
			phi = g.phiBtm;
			exc = g.geoBtm === 'cylinder' ? g.excBtm : -g.excBtm;
			unit = g.excUnitBtm;
			tilt = g.tiltBtm;
			reverseOrder = false;
			sign = g.geoBtm === 'plane' ? -1 : 1; // 1 for 'sphere', 'cylinder'
			
			if ( g.geoBtm === 'plane' ) cylinder_makePlaneBound( );
			if ( g.geoBtm === 'sphere' ) cylinder_makeSphereBound( );
			if ( g.geoBtm === 'cylinder' ) cylinder_makeCylinderBound( );
			
			
			yOff = g.top;
			g.div4Adp = g.div4Top;
			phi = g.phiTop;
			exc = g.geoTop === 'cylinder' ? -g.excTop : g.excTop;
			unit = g.excUnitTop;
			tilt = g.tiltTop;
			reverseOrder = true;
			sign =  g.geoTop === 'cylinder' ? -1 : 1; // 1 for 'plane', 'sphere'
			
			if ( g.geoTop === 'plane' ) cylinder_makePlaneBound( );
			if ( g.geoTop === 'sphere' ) cylinder_makeSphereBound( );
			if ( g.geoTop === 'cylinder' ) cylinder_makeCylinderBound( );
			
			// holes
			
			for ( let i = 0; i < g.holes.length; i ++ ) {
				
				if ( g.holes[ i ][ 0 ] === 'sphere' ) {
					
					cylinder_makeSphereHole( i ); // [ 'sphere', div4Adp, y, phi, exc, unit ]
					
				} else if ( g.holes[ i ][ 0 ] === 'cylinder' ) {
					
					cylinder_makeCylinderHole( i ); // [ 'cylinder', div4Adap, y, phi, exc, unit, tilt, <optional: side> ]
					
				} else {
					
					makePointsFront( i ); // points: [ y, phi, ... ]
					
				}
				
			}
			
		}
		
	}
	
	function initFront( ) {
		
		xmin = ymin = zmin = Infinity;
		xmax = ymax = zmax = -Infinity;
		
		fronts[ frontNo ] = [];
		boundings[ frontNo ] = [];
		
	}
	
	function posReverse( ) {
 		
		for ( let i = posLen - 3; i  > -1; i -= 3 ){
			
			pos.push( pos[ i ], pos[ i + 1 ], pos[ i + 2 ] ); // add reverse order
			
		}
		
		pos.splice( 0, posLen ); // remove beginning of field
		
	}
	
	function makeFrontPos( xyzCalculation ) {
		
		psi = psiStart;
		dpsi = Math.PI * 2 / Math.max( g.detail, g.detailAdp ) / 16; 
		sqlen1 = Infinity; // initial
		
		xyzCalculation( ); // start point
		
		pos.push( x, y, z );
		
		// notice start point
		x0 = x;
		y0 = y;
		z0 = z;
 		
		psi = psiEnd;
		xyzCalculation( );
		psi = psiStart; // initial again
		
		// notice endpoint to check finish
		x1 = x; 
		y1 = y;
		z1 = z;
	 	
		while ( sign > 0 ? psi < psiEnd && ( sqlen1 > 5.76 * dd || psi < ( psiStart + psiEnd ) / 2 ) : psi > psiEnd && ( sqlen1 > 5.76 * dd || psi > ( psiStart + psiEnd ) / 2 ) ) {
			
			psi0 = psi;
			sqlen0 = 0;
			
			while ( sqlen0 < 0.81 * dd ) {
				
				psi += sign * dpsi;
				
				xyzCalculation( );
				
				dx = x - x0;
				dy = y - y0;
				dz = z - z0;
				
				sqlen0 = squareLength( dx, dy, dz );
				
			}
			
			pos.push( x, y, z );
			
			if ( slope === 'dx' ) {
			
				dyzdx = Math.abs( Math.sqrt( dy * dy + dz * dz ) / dx );
				dyzdx = dyzdx > 1 ? 1 : dyzdx;
				dpsi = Math.abs( psi - psi0 ) * dyzdx / 16;
				
			} else { // 'dy'
				
				dxzdy = Math.abs( Math.sqrt( dx * dx + dz * dz ) / dy );
				dxzdy = dxzdy > 1 ? 1 : dxzdy;
				dpsi = Math.abs( psi - psi0 ) * dxzdy / 16;
				
			}
			
			x0 = x; 
			y0 = y; 
			z0 = z;
			
			dx = x - x1;
			dy = y - y1; 
			dz = z - z1;
			
			sqlen1 = squareLength( dx, dy, dz );
			
		}
		
		// possibly a intermediate point
		
		if( sqlen1 > 1.44 * dd ) {
			
			psi += ( psiEnd - psi ) / 2 ;
			xyzCalculation( );
			pos.push( x, y, z );
			
		}
		
		if( endPoint ) {
			
		 	pos.push( x1, y1, z1 );
 			
		}
		
	}
	
	function sphere_writeCylFront( i ) {
		
		xa = pos[ i     ]; 
		ya = pos[ i + 1 ];
		za = pos[ i + 2 ];
		
		// rotate around z axis 
		xb = xa * Math.cos( theta ) + ya * Math.sin( theta ); 
		yb = -xa * Math.sin( theta ) + ya * Math.cos( theta );
		
		// rotate around y axis 
		x = xb * Math.cos( phi ) + za * Math.sin( phi );
		z = -xb * Math.sin( phi ) + za * Math.cos( phi );
		
		y = yb; // for storing and checking bounds
		
		g.positions[ posIdx     ] = x;
		g.positions[ posIdx + 1 ] = y;
		g.positions[ posIdx + 2 ] = z;
		
		fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
		
		minMaxValues( x, y, z );
		
		posIdx += 3;
		
	}
	
	function cylinder_writeFrontBuffer( ) {
		
		initFront( );
		
		for ( let i = 0; i < pos.length; i += 3 ) {
			
			xa = pos[ i     ]; 
			ya = pos[ i + 1 ];
			za = pos[ i + 2 ];
	 		
			// rotate around y axis
			x = xa * Math.cos( phi ) - za * Math.sin( phi );
			z = xa * Math.sin( phi ) + za * Math.cos( phi );
			
			y = ya + yOff;
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			minMaxValues( x, y, z );
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function sphere_makeCircularHole( i ) {
		
		g.div4Adp = g.holes[ i ][ 1 ];
		theta = g.holes[ i ][ 2 ];
		phi = g.holes[ i ][ 3 ];
		
		g.detailAdp = g.div4Adp * 4;
		g.rAdp = g.d / Math.sin( Math.PI / g.detailAdp ) / 2; // radius cutting circle
		h = Math.sqrt( g.radius * g.radius - g.rAdp * g.rAdp ); // distance: sphere center to cutting circle
		
		xp = g.radius *  Math.sin( theta ) * Math.cos( phi );
		yp = g.radius *  Math.cos( theta );
		zp = -g.radius * -Math.sin( theta ) * Math.sin( phi );
		
		xc = h / g.radius * xp;
		yc = h / g.radius * yp;
		zc = h / g.radius * zp;
		
		g.circles.push( [ g.div4Adp, xc, yc, zc, g.rAdp ] ); // values for external use
		
		initFront( );
		
		ya = h;
		
		for ( let i = 0, psi = 0; i < g.detailAdp; i ++, psi += 2 * Math.PI / g.detailAdp ) {
			
			//  cutting circle on top
			xa = g.rAdp * Math.cos( psi );
			za = g.rAdp * Math.sin( psi );
			 
			// rotate around z axis 
			xb = xa * Math.cos( theta ) - ya * Math.sin( theta );
			yb = xa * Math.sin( theta ) + ya * Math.cos( theta );
			
			// rotate around y axis 
			x = -xb * Math.cos( phi ) + za * Math.sin( phi ); 
			z = xb * Math.sin( phi ) + za * Math.cos( phi );
			
			y = yb; // for storing and checking bounds
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			minMaxValues( x, y, z );
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function sphere_makeCylinderHole( i ) {
	
		g.div4Adp = g.holes[ i ][ 1 ];
		theta = g.holes[ i ][ 2 ];
		phi = g.holes[ i ][ 3 ];
		
		unit = g.holes[ i ][ 5 ];
		side = g.holes[ i ][ 6 ] !== undefined ? g.holes[ i ][ 6 ] : '+'; // side: '+' default, '-', '+-' or '-+'
		
		switch ( unit ) {
			case '%':
				exc = g.holes[ i ][ 4 ] / 100 * g.radius; // percent value can be larger than 100
				break;	 
			case'd':
				exc = g.holes[ i ][ 4 ] * g.d;
				break;
			case'v':
				exc = g.holes[ i ][ 4 ];
				break;
			default: // like 'v' value
				exc = g.holes[ i ][ 4 ];
			 
		}
		
		exc = exc === 0 ? 0.000000001 : exc;	// to prevent division by zero
		
		g.detailAdp = g.div4Adp * 4;
		g.rAdp = g.d / Math.sin( Math.PI / g.detailAdp ) / 2; //  adapted cylinder radius
		
		if ( g.radius + g.rAdp - exc > 0 ) { // cut
			
			// partial front: cutline PI <= psi <= 2*PI
			// y = sqrt( g.radius * g.radius - g.rAdp * g.rAdp - exc * exc - 2 * g.rAdp * exc * cos( psi ) )
			
			rex = g.radius * g.radius - g.rAdp * g.rAdp - exc * exc;
			
			sign = 1;
			psiStart = Math.PI;
			
			endPoint = true;
			slope = 'dy';
 			pos = [];
			
			if ( g.rAdp + exc <= g.radius ) { // two separate holes
				
				psiEnd = Math.PI * 2;
				connected = false;
				
			} else { // a connected hole 
				
				psiEnd = psiStart + Math.acos( rex / ( -2 * g.rAdp * exc ) );
				connected = true;
				
			}
			
			makeFrontPos( sphere_xyzCylinderHole );
			
			posLen = pos.length;
			
			// generate complete front
			
			if ( connected ) {
				
				for ( let i = posLen - 6; i > -1; i -= 3 ) {
					
					pos.push( pos[ i ], -pos[ i + 1 ], pos[ i + 2 ] );
					
				}
				
				posLen = pos.length;
				
				for ( let i = 3 ; i < posLen * 2 - 3 ; i += 6 ) {
					
					pos.unshift( pos[ i ], pos[ i + 1 ], -pos[ i + 2 ] );
					
				}
				
			} else {
				
				for ( let i = 3 ; i < posLen * 2 - 9; i += 6 ) {
					
					pos.unshift( pos[ i ], pos[ i + 1 ], -pos[ i + 2 ] );
					
				}
				
			}
			
			// write front buffer array
 			
			if ( connected || ( !connected && ( side === '+' || side === '+-' || side === '-+' ) ) ) {
				
				initFront( );
				
				for ( let i = pos.length - 3; i > -1; i -= 3 ) {
					
					sphere_writeCylFront( i );
					
				}
				
				boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
				
				frontNo ++;
				frontStock ++;
				
			}
 			
			if ( !connected && ( side === '-' || side === '+-' || side === '-+' )  ) {
				
				initFront( );
				
				for ( let i = 0; i < pos.length; i += 3 ) pos[ i + 1 ] = -pos[ i + 1 ]; // '-' mirror
				
				for ( let i = 0; i < pos.length; i += 3 ) {
					
					sphere_writeCylFront( i );
					
				}
				
				boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
				
				frontNo ++;
				frontStock ++;
				
			}
			
		}
		
	}
	
	function sphere_xyzCylinderHole( ) {
		
		dsc = rex - 2 * g.rAdp * exc * Math.cos( psi );
		dsc = dsc > 0 ? dsc : 0; // to prevent negativ value
		
		x = g.rAdp * Math.cos( psi ) + exc;
		y = Math.sqrt( dsc );
		z = g.rAdp * Math.sin( psi );
		
	}
	
	function cylinder_makePlaneBound( ) {
		
		tantilt = Math.tan( tilt ); // NOTE! tilt +PI/2..-PI/2 also for the calculation
		g.detailAdp = g.detail; // identical division
		
		// sign is set above
		
		psiStart = sign < 0 ? Math.PI * 2 : 0;
		psiEnd = sign < 0 ? 0 : Math.PI * 2;
		
		endPoint = false;
		slope = 'dy';
		pos = [];
		
		makeFrontPos( cylinder_xyzPlaneBound );
		
		posLen = pos.length;
		
		if ( sign < 0 && g.cap !== 'btm' ) posReverse( ); // g.cap is undefined for cylinder
		
		cylinder_writeFrontBuffer( );
		
	}
	
	function cylinder_xyzPlaneBound( ) {
		
		x = g.radius * Math.cos( psi );
		y = g.radius * Math.cos ( psi ) * tantilt;
		z = g.radius * Math.sin( sign * psi );

		if ( g.cap !== 'btm' ) z = -z; // g.cap is undefined for cylinder
		
	}
	
	function cylinder_makeSphereBound( ) {
		
		if ( unit === '%' ) exc = exc / 100 * g.radius; // percent value can be larger than 100
		if ( unit === 'd' ) exc = exc * g.d;
		
		// partial front: cutline PI <= psi <= 2*PI
		// y = sqrt( g.rAdp * g.rAdp - g.radius * g.radius - exc * exc - 2 * g.radius * exc * cos( psi ) )
		
		g.detailAdp = g.div4Adp * 4;
		g.rAdp = g.d / Math.sin( Math.PI / g.detailAdp ) / 2; // adapted sphere radius
		rex = g.rAdp * g.rAdp - g.radius * g.radius - exc * exc;
		
		// sign, reverseOrder are set above
		psiStart = Math.PI;
		psiEnd = Math.PI * 2;
		endPoint = true;
		slope = 'dy';
		pos = [];
		
		makeFrontPos( cylinder_xyzSphereBound );
		
		posLen = pos.length;
		
		// generate complete front
		
		for ( let i = 3 ; i < posLen * 2 - 9; i += 6 ){
			
			pos.unshift( pos[ i ], pos[ i + 1 ], -pos[ i + 2 ] ); // add mirrored z value ( related psi 0..PI )
			
		}
		
		posLen = pos.length; // double pos.length!
		
		if ( reverseOrder ) {
			
			for ( let i = 1; i < posLen; i += 3 ){
				
				pos[ i ] = -pos[ i ];
				
			}
			
			posReverse( );
			
		}
		
		cylinder_writeFrontBuffer( ); 
		
	}
	
	function cylinder_xyzSphereBound( ){
		
		dsc = rex - 2 * g.radius * exc * Math.cos( psi );
		dsc = dsc > 0 ? dsc : 0; // to prevent negativ value
		
		x = g.radius * Math.cos( psi );
		y = Math.sqrt( dsc ) - g.rAdp;
		z = g.radius * Math.sin( psi );
		
	}
	
	function cylinder_makeCylinderBound( ) {
		
		if ( unit === '%' ) exc = exc / 100 * g.radius; // percent value can be larger than 100
		if ( unit === 'd' ) exc = exc * g.d;
		
		tilt = Math.PI / 2 - tilt; // NOTE! +PI/2..-PI/2 to 0..PI for calculation
		
		g.detailAdp = g.div4Adp * 4;
		g.rAdp = g.d / Math.sin( Math.PI / g.detailAdp ) / 2; // adapted cylinder radius
		
		sintilt = Math.sin( tilt );
		sintilt = sintilt === 0 ? 0.000000001 : sintilt; // to prevent division by zero
		costilt = Math.cos( tilt );
		
		// sign is set above
		
		psiStart = -sign * Math.PI;
		psiEnd = sign * Math.PI;
		
		endPoint = false;
		slope = 'dx';
		
		pos = [];
	 	
		r0 = g.radius;
		r1 = g.rAdp;
		
		makeFrontPos( cylinder_xyzCylinderBoundOrHole );
		
		// following code like cylinder_writeFrontBuffer( ) with extra rotations
		
		posLen = pos.length;
		
		posReverse( );
		
		initFront( );
		
		for ( let i = 0; i < pos.length; i += 3 ) {
			
			xa = pos[ i ];
			ya = pos[ i + 1 ];
			za = pos[ i + 2 ];
			
			// rotate around z axis ( x to y direction )
			xb = xa * costilt - ya * sintilt;
			yb = xa * sintilt + ya * costilt;
			
			za = za + exc;
			yb = yb - sign * g.rAdp / sintilt;
			
			// rotate around y axis
			x = xb * Math.cos( phi ) - za * Math.sin( phi );
			z = xb * Math.sin( phi ) + za * Math.cos( phi );
			
			y = yb + yOff;
			
			g.positions[ posIdx     ] = x;
			g.positions[ posIdx + 1 ] = y;
			g.positions[ posIdx + 2 ] = z;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			minMaxValues( x, y, z );
			
			posIdx += 3;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
		
		frontNo ++;
		frontStock ++;
		
	}
	
	function cylinder_makeSphereHole( i ) {
		
		g.div4Adp = g.holes[ i ][ 1 ];
		yOff = g.holes[ i ][ 2 ];
		phi = -( Math.PI + g.holes[ i ][ 3 ] );	
		
		unit = g.holes[ i ][ 5 ];
		
		g.detailAdp = g.div4Adp * 4;
		g.rAdp = g.d / Math.sin( Math.PI / g.detailAdp ) / 2; // adapted sphere radius 
		
		switch ( unit ) {
			case '%':
				exc = g.holes[ i ][ 4 ] / 100 * g.radius;  // percent value can be larger than 100
				break;
			case'd':
				exc = g.holes[ i ][ 4 ] * g.d;
				break;
			case'v':
				exc = g.holes[ i ][ 4 ];
				break;
				
			default: // like 'v' value
				exc = g.holes[ i ][ 4 ];
				
		}
		
		exc = exc === 0 ? 0.0000000000001 : exc; // to prevent division by zero ( psiEnd )
		
		if ( g.radius + g.rAdp - exc > 0 ) { // cut
			
			// partial front:
			// y = sqrt( g.rAdp * g.rAdp - g.radius * g.radius - exc * exc - 2 * g.radius * exc * cos( psi ) )
			
			rex = g.rAdp * g.rAdp - g.radius * g.radius - exc * exc;
			
			sign = 1;
			psiStart = Math.PI;
			psiEnd = psiStart + Math.acos( rex / ( -2 * g.radius * exc ) );
 			endPoint = true;
			slope = 'dy';
			pos = [];
			
			makeFrontPos( cylinder_xyzSphereHole );
			
			posLen = pos.length;
			
			// generate complete front
			
			for ( let i = posLen - 6; i > -1; i -= 3 ) {
				
				pos.push( pos[ i ], -pos[ i + 1 ], pos[ i + 2 ] );
				
			}
			
			posLen = pos.length;
			
			for ( let i = 3 ; i < posLen * 2 - 3 ; i += 6 ) {
				
				pos.unshift( pos[ i ], pos[ i + 1 ], -pos[ i + 2 ] );
				
			}
			
			cylinder_writeFrontBuffer( ); 
			
		}
		
	}
	
	function cylinder_xyzSphereHole( ) {
		
		dsc = rex - 2 * g.radius * exc * Math.cos( psi );
		
		x = g.radius * Math.cos( psi );
		y = Math.sqrt( dsc );
		z = g.radius * Math.sin( psi );
		
	}
	
	function cylinder_makeCylinderHole( i ) {
		
		g.div4Adp = g.holes[ i ][ 1 ];
		yOff = g.holes[ i ][ 2 ];
		phi = -g.holes[ i ][ 3 ];
		
		unit = g.holes[ i ][ 5 ];
		tilt = Math.PI / 2 - g.holes[ i ][ 6 ]; // NOTE! +PI/2..-PI/2 to 0..PI for calculation
		side = g.holes[ i ][ 7 ] !== undefined ? g.holes[ i ][ 7 ] : '+'; // side: '+' default, '-', '+-' or '-+'
		
		switch ( unit ) {
			case '%':
				exc = g.holes[ i ][ 4 ] / 100 * g.radius; // percent value can be larger than 100
				break;
			case'd':
				exc = g.holes[ i ][ 4 ] * g.d;
				break;
			case'v':
				exc = g.holes[ i ][ 4 ];
				break;
			default: // like 'v' value
				exc = g.holes[ i ][ 4 ];
			
		}
		
		g.detailAdp = g.div4Adp * 4;
		g.rAdp = g.d / Math.sin( Math.PI / g.detailAdp ) / 2; // radius (deformed) cutting circle
		
		if ( g.radius + g.rAdp - exc > 0 ) { // cut
			
			sintilt = Math.sin( tilt );
			sintilt = sintilt === 0 ? 0.000000001 : sintilt; // to prevent division by zero
			costilt = Math.cos( tilt );
			
			r0 = Math.min( g.rAdp, g.radius );
			r1 = Math.max( g.rAdp, g.radius );
			
			if ( r0 + exc > r1 ) { // a connected hole, side is ignored
				
				psiBound = Math.acos( ( r1 - exc ) / r0 );
				
				sign = 1;
				psiStart = psiBound;
				psiEnd = Math.PI * 2 - psiBound;
				endPoint = false;
				slope = 'dx';
				pos = [];
				
				makeFrontPos( cylinder_xyzCylinderBoundOrHole );
	 			
				sign = -1;
				psiStart = Math.PI * 2 - psiBound;
				psiEnd = psiBound;
				endPoint = false;
				
				makeFrontPos( cylinder_xyzCylinderBoundOrHole );
				
				// following code like cylinder_writeFrontBuffer( ) with extra rotations
				
				initFront( );
				
				posLen = pos.length;
				
				if ( g.rAdp > g.radius ) posReverse( );
				
				for ( let i = 0; i < posLen; i += 3 ) {
					
					xa = pos[ i     ]; 
					ya = pos[ i + 1 ];
					za = pos[ i + 2 ];
					
					if ( g.rAdp > g.radius ) {
						
						// rotate around z axis ( x to y direction )
						xb = xa * costilt - ya * sintilt;
						yb = xa * sintilt + ya * costilt;
						
						xa = xb;
						ya = yb;
						za = za + exc ;
						
					}
					
					// rotate around y axis
					x = xa * Math.cos( phi ) - za * Math.sin( phi );
					z = xa * Math.sin( phi ) + za * Math.cos( phi );
					
					y = ya + yOff;
					
					g.positions[ posIdx     ] = x;
					g.positions[ posIdx + 1 ] = y;
					g.positions[ posIdx + 2 ] = z;
					
					fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
					
					minMaxValues( x, y, z );
					
					posIdx += 3;
					
				}
				
				boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
				
				frontNo ++;
				frontStock ++;
				
			}
			
			if ( r0 + exc <= r1 && ( side === '+' || side === '+-' || side === '-+' ) ) { // two separate holes (first: side === '+')
				
				sign = 1;
				psiStart = -Math.PI;
				psiEnd = Math.PI;
				endPoint = false;
				slope = 'dx';
				pos = [];
				
				makeFrontPos( cylinder_xyzCylinderBoundOrHole );
				
				cylinder_writeFrontBuffer( );
				
			}
			
			if ( r0 + exc <= r1 && ( side === '-' || side === '+-' || side === '-+'  ) ) { // two separate holes (second: side === '-')
				
				sign = -1;
				psiStart = Math.PI; 
				psiEnd = -Math.PI;
				endPoint = false;
				slope = 'dx';
				pos = []; // new separate fron
				
				makeFrontPos( cylinder_xyzCylinderBoundOrHole );
				
				cylinder_writeFrontBuffer( );
				
			}
			
		}
		
	}
	
	function cylinder_xyzCylinderBoundOrHole( ) { // uses r0, r1
		
		sinpsi = Math.sin( psi );
		cospsi = Math.cos( psi );
		dsc = r1 * r1 - ( exc  + r0 * cospsi ) * ( exc  + r0 * cospsi );
		t = ( r0 * sinpsi * costilt + sign * Math.sqrt( dsc ) ) / sintilt;
		
		x = t * sintilt - r0 * sinpsi * costilt; 
		y = t * costilt + r0 * sinpsi * sintilt;
		z = -( exc + r0 * cospsi );
		
	}
	
	function makePointsFront( i ) {
		
		let jMax;
		initFront( );
		
		switch ( g.surface ) {
		
			case 'circle':			
			case 'polygon':
			case 'rectangle':			
			case 'outline':

				jMax = ( i < 0 ? outline.length : g.holes[ i ].length ) / 2 + 1;
				x1 = i < 0 ? outline[ 0 ] : g.holes[ i ][ 0 ] ;
				y1 = 0;
				z1 = i < 0 ? outline[ 1 ] : g.holes[ i ][ 1 ];
			break;
			
			case 'sphere':
			jMax = g.holes[ i ].length / 2 + 1;
			theta = g.holes[ i ][ 0 ];
			phi = g.holes[ i ][ 1 ]; 
			
			x1 = g.radius * Math.sin( theta ) * Math.cos( phi );
			y1 = g.radius * Math.cos( theta );
			z1 = -g.radius * Math.sin( theta ) * Math.sin( phi );
			break;
			
			case 'cylinder':
			jMax = g.holes[ i ].length / 2 + 1;
			yOff =  g.holes[ i ][ 0 ];
			phi = g.holes[ i ][ 1 ]; 	
			
			x1 = g.radius * Math.cos( phi );
			y1 = yOff;
			z1 = -g.radius * Math.sin( phi );
			break;
			
		}
		
		for ( let j = 1; j < jMax; j ++ ) {
			
			g.positions[ posIdx     ] = x1;
			g.positions[ posIdx + 1 ] = y1;
			g.positions[ posIdx + 2 ] = z1;
			
			fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
			
			minMaxValues( x1, y1, z1 );
			
			posIdx += 3;
			
			switch ( g.surface ) {
			
				case 'circle':			
				case 'polygon':
				case 'rectangle':
				case 'outline':
					
					x2 = i < 0 ? outline[ j < jMax - 1 ? 2 * j : 0 ] : g.holes[ i ][ j < jMax - 1 ? 2 * j : 0 ]; // 0 => connect to start
					y2 = 0;
					z2 = i < 0 ? outline[ j < jMax - 1 ? 2 * j + 1 : 1 ] : g.holes[ i ][ j < jMax - 1 ? 2 * j + 1 : 1 ] ;  // 1 => connect to start;
					
				break;
					
				case 'sphere':
				theta = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 : 0 ]; // 0 => connect to start
				phi = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 + 1 : 1 ]; // 1 => connect to start
				
				x2 = g.radius *  Math.sin( theta ) * Math.cos( phi );
				y2 = g.radius *  Math.cos( theta );
				z2 = -g.radius * Math.sin( theta ) * Math.sin( phi );
				break;
				
				case 'cylinder':
				phi = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 + 1 : 1 ]; // 1 => connect to start
				
				x2 = g.radius * Math.cos( phi );
				y2 = g.holes[ i ][ j < g.holes[ i ].length / 2 ? j * 2 : 0 ]; // 0 => connect to start
				z2 = -g.radius * Math.sin( phi );
				break;
			
			}
			
			dx = x2 - x1;
			dy = y2 - y1;
			dz = z2 - z1;
			
			len = length( dx, dy, dz );
			
			if ( len > g.d ) {
				
				count = Math.ceil( len / g.d );
				
				for ( let k = 1; k < count; k ++ ) {
					
					xp = x1 + k * dx / count;
					yp = y1 + k * dy / count;
					zp = z1 + k * dz / count;
					
					surfacePoint( );
					
					fronts[ frontNo ].push( { idx: posIdx / 3, ang: 0 } );
					
					minMaxValues( xp, yp, zp);
					
					posIdx += 3;
					
				}
				
			}
			
			x1 = x2;
			y1 = y2;
			z1 = z2;
			
		}
		
		boundings[ frontNo ].push( xmin, xmax, ymin, ymax, zmin, zmax );
 		
		frontNo ++;
		frontStock ++;
		
		outline = [];
		
	}	
	
}

exports.createInnerGeometry = createInnerGeometry;
exports.buildInnerGeometry = buildInnerGeometry;

// ............................ Implicit Surface (Triangulation)  ...................................

function createImplicitSurface( isf, dx, dy, dz, xs, ys, zs, d, e, opt ) {
	
	/*  parameters:
		isf implicit surface function
		dx  partial derivate to x
		dy  partial derivate to y
		dz  partial derivate to z
		xs  x start point
		ys  y start point
		zs  z start point
		d   rough edge length of triangles
		e   epsilon for iteration Newton
		
		opt optional object, all properties also optional
			{
				fc:  faces //( max. number of triangles )
				pc:  positions // ( max. number of points )
				b:   bounds //  array [ xMax, xMin, yMax, yMin, zMax, zMin ]
			}
	*/
	
	g = this;  //  THREE.BufferGeometry() - geometry object from three.js
	
	g.isf = isf;
	g.dx  = dx;
	g.dy  =	dy;
	g.dz  =	dz;
	g.xs  =	xs;
	g.ys  = ys;
	g.zs  =	zs;
	g.d   = d;
	g.e   =	e;
	
	if ( opt !== undefined ) {
		
		g.fc = ( opt.fc !== undefined ) ? opt.fc : 320000;
		g.pc = ( opt.pc !== undefined ) ? opt.pc : 160000;
		g.b = ( opt.b !== undefined ) ? opt.b : [];
		
	} else {
	
		g.fc = 320000;
		g.pc = 160000;
		g.b = [];
		
	}
	
	g.buildImplicitSurface = buildImplicitSurface;
	g.buildImplicitSurface( );
	
}

function buildImplicitSurface( ) {
	
	if ( g.b.length === 0 ) {
		
		triangulation( g.isf, g.dx, g.dy, g.dz, g.xs, g.ys, g.zs, g.d, g.e, g.fc, g.pc );
		
	} else {
		
		triangulationBounds( g.isf, g.dx, g.dy, g.dz, g.xs, g.ys, g.zs, g.d, g.e, g.fc, g.pc, g.b );
		
	}
	
	// The two slightly different functions can be copied separately into your own projects.
	
	function triangulation( isf, dx, dy, dz, xs, ys, zs, d, e, fc, pc ) {
		
		const squareLength = ( x,y,z ) => ( x*x + y*y + z*z );
		const length = ( x,y,z ) => ( Math.sqrt( x*x + y*y + z*z ) );
		const prevFront = ( i ) => ( i !== 0 ? i - 1 : front.length - 1 );
		const nextFront = ( i ) => ( i !== front.length - 1 ? i + 1 : 0 );
		const determinant = ( xa,ya,za, xb,yb,zb, xc,yc,zc ) => ( xa*yb*zc + ya*zb*xc + za*xb*yc - za*yb*xc - xa*zb*yc - ya*xb*zc );
		
		let m; // index of the current front point
		let n; // number of new points
		let nT; // number of new triangles
		let nIns; // number of new points (after union or split)
		let dAng; // partial angle
		let phi; // angle (new points)
		let len, d1, d2, d12; // lengths
		let iSplit, jSplit; // split front indices  
		let iUnite, jUnite, fUnite; // unite front indices, front number (to unite) 
		
		// points and vectors:
		let xp, yp, zp; // actual point p
		let x1, y1, z1, x2, y2, z2; // previous and next point to p in front
		let xn, yn, zn; // partial derivations on point p, normal, gradient
		let xt1, yt1, zt1, xt2, yt2, zt2; // tangents
		let xs1, ys1, xs2, ys2; // p in tangential system (only x, y required)
		let xc, yc, zc; // actual point as center point for new points
		
		//  preparation
		
		g.indices = new Uint32Array( fc * 3 );
		g.positions = new Float32Array( pc * 3 );
		g.normals = new Float32Array( pc * 3 );
		
		g.setIndex( new THREE.BufferAttribute( g.indices, 1 ) );
		g.addAttribute( 'position', new THREE.BufferAttribute( g.positions, 3 ) );
		g.addAttribute( 'normal', new THREE.BufferAttribute( g.normals, 3 ) );
		
		let posIdx = 0;
		let indIdx = 0;
		let frontPosIdx, unionIdxA, unionIdxB, splitIdx;
		
		let front = []; // active front // front[ i ]: object { idx: 0, ang: 0 }
		let partFront = []; // separated part of the active front (to split)
		let insertFront = []; // new front points to insert into active front
		let fronts = []; // all fronts
		let partBounds = []; // bounding box of partFront [ xmin, ymin, zmin, xmax, ymax, zmax ]
		let boundings = []; // fronts bounding boxes
		let smallAngles = []; // new angles < 1.5
		
		let unite = false;
		let split = false;
		
		let dd = d * d;
		
		fronts.push( [] );
		boundings.push( [] );
		
		let frontStock = 0; // number of fronts still to be processed
		let frontNo = 0;
		front = fronts[ frontNo ];
		
		///////////////////// DEBUG triangles /////////////////////////
		// let stp = 0; 
		///////////////////////////////////////////////////////////////
		
		makeFirstTriangle( ); // first triangle creates a front
		
		// ------ triangulation cycle -------------
		
		while ( frontStock > 0 ) {	
			
			if (  !unite && !split ) { // triangulation on the front
				
				smallAngles = [];
				
				for ( let i = 0; i < front.length; i ++ ) {
					
					if( front[ i ].ang === 0 ) calculateFrontAngle( i ); // is to be recalculated (angle was set to zero)
					
				}
				
				m = getMinimalAngleIndex( ); // front angle
				makeNewTriangles( m );
				
				if ( front.length > 9 && smallAngles.length === 0 ) {
					
					checkDistancesToUnite( m );
					checkDistancesToSplit( m );
					
				}
				
				if ( front.length === 3 ) {
					
					makeLastTriangle( ); // last triangle closes the front
					chooseNextFront( ); // if aviable
					
				}
				
			} else { // unite the active front to another front or split the active front
				
				if ( unite ) {
					
					uniteFront(  m, iUnite, fUnite, jUnite );
					trianglesAtUnionPoints( );
					unite = false;
					
				} else if ( split ) {
					
					splitFront( iSplit, jSplit );
					trianglesAtSplitPoints( );
					split = false;
					
				}
				
			}
			
			/////////////// DEBUG triangles /////////////////////
			// if ( stp > 100 ) break;
			///////////////////////////////////////////////////////
			
		}
		
		// .....  detail functions .....
		
		function makeFirstTriangle( ) {
			
			xp = xs;
			yp = ys;
			zp = zs;
			
			iterationNewton( );
			
			// first point
			g.positions[ posIdx     ] = xp;
			g.positions[ posIdx + 1 ] = yp;
			g.positions[ posIdx + 2 ] = zp;
			
			// first normal
			g.normals[ posIdx     ] = xn;
			g.normals[ posIdx + 1 ] = yn;
			g.normals[ posIdx + 2 ] = zn;
			
			front.push( { idx: posIdx / 3, ang: 0 } ); // first front point
			
			posIdx += 3;
			
			// start point neighbour
			x1 = xs + d / 32;
			y1 = ys + d / 32;
			z1 = zs + d / 32;
			
			calculateTangentsPoint( ); // start point and neighbour
			
			xc = xp;
			yc = yp;
			zc = zp;
			
			phi = 0;
			
			for ( let i = 0; i < 2; i ++ ) {
				
				calculateSurfacePointAndNormal( );
				
				front.push( { idx: posIdx / 3, ang: 0 } ); 
				
				posIdx += 3;
				
				phi += Math.PI / 3;
				
			}
			
			g.indices[ indIdx     ] = 0;
			g.indices[ indIdx + 1 ] = 1;
			g.indices[ indIdx + 2 ] = 2;
			
			indIdx += 3;
			
			frontStock += 1;
			
		}
		
		function checkDistancesToUnite( m ) { // for new active front points
			
			let idxJ, xChk, yChk, zChk, ddUnite;
			let ddUniteMin = Infinity;
			unite = false;
			
			for ( let i = 0; i < insertFront.length; i ++ ) {
				
				getPoint( m + i );
				
				for ( let f = 0; f < fronts.length; f ++ ) {
					
					if ( f !== frontNo ) {
						
						xChk = ( xp > boundings[ f ][ 0 ] - d ) && ( xp < boundings[ f ][ 3 ] + d );
						yChk = ( yp > boundings[ f ][ 1 ] - d ) && ( yp < boundings[ f ][ 4 ] + d );
						zChk = ( zp > boundings[ f ][ 2 ] - d ) && ( zp < boundings[ f ][ 5 ] + d );
						
						if (  xChk || yChk || zChk ) {
							
							for ( let j = 0; j < fronts[ f ].length; j ++ ) {
								
								idxJ = fronts[ f ][ j ].idx * 3;
								
								// Hint: here (2) is exceptionally point in other front!
								x2 = g.positions[ idxJ ]; 
								y2 = g.positions[ idxJ + 1 ];
								z2 = g.positions[ idxJ + 2 ];
								
								ddUnite = squareLength ( x2 - xp, y2 - yp, z2 - zp );
								
								if ( ddUnite < dd && ddUnite < ddUniteMin ) {
									
									ddUniteMin = ddUnite; 
									iUnite = i;
									jUnite = j;
									fUnite = f;
									unite = true;
									
								}
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
		function uniteFront( m, i, f, j ) {
			
			let tmp = [];
			
			tmp[ 0 ] = front.slice( 0, m + i + 1 );	
			tmp[ 1 ] = fronts[ f ].slice( j , fronts[ f ].length );
			tmp[ 2 ] = fronts[ f ].slice( 0 , j + 1 );
			tmp[ 3 ] = front.slice( m + i, front.length );
			
			unionIdxA = m + i;
			unionIdxB = m + i + 1 + fronts[ f ].length
			
			front = [];
			
			for ( let t = 0; t < 4; t ++ ) {
				
				for ( let k = 0; k < tmp[ t ].length ; k ++ ) {
					
					front.push( tmp[ t ][ k ] );
					
				}
				
			}
			
			fronts[ f ] = []; // empty united front
			
			frontStock -= 1; // front is eliminated
			
		}
		
		function trianglesAtUnionPoints( ) {
			
			nIns = 0; // count inserted points
			
			calculateFrontAngle( unionIdxA );
			calculateFrontAngle( unionIdxA + 1 );
			
			if ( front[ unionIdxA ].ang < front[ unionIdxA + 1 ].ang ) {
				
				makeNewTriangles( unionIdxA );
				nIns += n - 1;
				calculateFrontAngle( unionIdxA + 1 + nIns );
				makeNewTriangles( unionIdxA + 1 + nIns );
				nIns += n - 1;
				
			} else {
				
				makeNewTriangles( unionIdxA + 1 );
				nIns += n - 1;
				calculateFrontAngle( unionIdxA );
				makeNewTriangles( unionIdxA );
				nIns += n - 1;
			}
			
			calculateFrontAngle( unionIdxB + nIns );
			calculateFrontAngle( unionIdxB + 1 + nIns );
			
			if ( front[ unionIdxB + nIns ].ang < front[ unionIdxB + 1 + nIns ].ang ) {
				
				makeNewTriangles( unionIdxB + nIns );
				nIns += n - 1;
				calculateFrontAngle( unionIdxB + 1 + nIns );
				makeNewTriangles( unionIdxB + 1 + nIns );
				
			} else {
				
				makeNewTriangles( unionIdxB + 1 + nIns );
				calculateFrontAngle( unionIdxB + nIns );
				makeNewTriangles( unionIdxB + nIns );
				
			}
			
		}
		
		function checkDistancesToSplit( m ) { // for new active front points
			
			let mj, mjIdx, ddSplit;
			let ddSplitMin = Infinity;
			split = false;
			
			for ( let i = 0; i < front.length ; i ++ ) {
				
				for ( let j = 0; j < n; j ++ ) { // check n new points (insertFront)
					
					mj = m + j;
					
					// except new points themselves and neighbor points
					if ( Math.abs( i - mj ) > 3 && Math.abs( i - mj ) < front.length - 3 ) {
						
						mjIdx = front[ mj ].idx * 3;
						
						// Hint: here (1) is exceptionally new point in the front!
						x1 = g.positions[ mjIdx ]; 
						y1 = g.positions[ mjIdx + 1 ];
						z1 = g.positions[ mjIdx + 2 ];
						
						getPoint( i );
						
						ddSplit = squareLength ( x1 - xp, y1 - yp, z1 - zp );
						
						if ( ddSplit < dd && ddSplit < ddSplitMin ) {
							
							ddSplitMin = ddSplit;
							iSplit = i;
							jSplit = mj;
							split = true; 
							
						}
						
					}
					
				}
				
			}
			
		}
		
		function splitFront( iSplit, jSplit ) {
			
			let k;
			
			front[ iSplit ].ang = 0;
			front[ jSplit ].ang = 0;
			
			if ( iSplit > jSplit )  { // swap
				
				k = jSplit;
				jSplit = iSplit;
				iSplit = k;
				
			} 
			
			splitIdx = iSplit;	// lower index
			
			partFront = [];
			
			// to duplicate
			let frontI = front[ iSplit ];
			let frontJ = front[ jSplit ];
			
			partFront = front.splice( iSplit + 1, jSplit - iSplit - 1 );
			partFront.unshift( frontI );
			partFront.push( frontJ );
			
			fronts.push( partFront );
			
			partFrontBounds( );
			
			frontStock += 1; // new front created
			
		}
		
		function trianglesAtSplitPoints( ) {
			
			nIns = 0; // count inserted points
			
			let idx0 = splitIdx; // splitIdx is the lower index 
			let idx1 = splitIdx + 1;
			
			calculateFrontAngle( idx0 );
			calculateFrontAngle( idx1 );
			
			if ( front[ idx1 ].ang < front[ idx0 ].ang ){
				
				makeNewTriangles( idx1 );
				nIns += n - 1;
				calculateFrontAngle( idx0 );
				makeNewTriangles( idx0 );
				
			} else {
				
				makeNewTriangles( idx0 );
				nIns += n - 1;
				calculateFrontAngle( idx1 + nIns );
				makeNewTriangles( idx1 + nIns );
				
			}
			
		}
		
		function getMinimalAngleIndex( ) {
			
			let angle = Infinity;
			let m;
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				if( front[ i ].ang < angle  ) {
					
					angle = front[ i ].ang ;
					m = i;
					
				}
				
			}
			
			return m;
			
		}
		
		function makeNewTriangles( m ) {
			
			insertFront = []; // new front points
			
			nT = Math.floor( 3 * front[ m ].ang / Math.PI ) + 1; // number of new triangles
			
			dAng = front[ m ].ang / nT;
			
			getPrevPoint( m );
			getPoint( m );
			getNextPoint( m );
			getNormal( m );
			
			calculateTangentsPoint( );
			
			d1 = length( x1 - xp, y1 - yp, z1 - zp );
			d2 = length( x2 - xp, y2 - yp, z2 - zp );
			
			d12 = length( x2 - x1, y2 - y1, z2 - z1 );
			
			// correction of dAng, nT in extreme cases
			
			if ( dAng < 0.8 && nT > 1 ) {
				
				nT --;
				dAng = front[ m ].ang / nT;
				
			}
			
			if ( dAng > 0.8 && nT === 1 && d12 > 1.25 * d ) {
				
				nT = 2; 
				dAng = front[ m ].ang / nT;
				
			}
			
			if ( d1 * d1 < 0.2 * d * d ||  d2 * d2 < 0.2 * d * d  ) {
				
				nT = 1;
				
			}
			
			n = nT - 1;  // n number of new points
			
			if ( n === 0 ) { // one triangle
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx; 
				g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
				
				indIdx += 3;
				
				/////////////// DEBUG triangles ///////////////////////
				// stp ++
				///////////////////////////////////////////////////////
				
				front[ prevFront( m ) ].ang = 0;
				front[ nextFront( m ) ].ang = 0;
				
				front.splice( m, 1 ); // delete point with index m from the front
				
			} else { // more then one triangle
				
				// point p is center of circle in tangent plane
				
				xc = xp;
				yc = yp;
				zc = zp;
				
				phi = dAng; // start angle in tangential system
				
				for ( let i = 0 ; i < n; i ++ ) {
					
					calculateSurfacePointAndNormal( );
					
					insertFront.push( { idx: posIdx / 3, ang: 0 } );
					
					posIdx += 3;
					
					phi += dAng;
					
				}
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx 
				g.indices[ indIdx + 2 ] = insertFront[ 0 ].idx;
				
				indIdx += 3;
				
				/////////////// DEBUG triangles ///////////////////////
				// stp ++
				///////////////////////////////////////////////////////
				
				front[ prevFront( m ) ].ang = 0;
				
				for ( let i = 0; i < n - 1; i ++ ) {
					
					g.indices[ indIdx     ] = front[ m ].idx;
					g.indices[ indIdx + 1 ] = insertFront[ i ].idx;
					g.indices[ indIdx + 2 ] = insertFront[ i + 1 ].idx;
					
					indIdx += 3;
					
					/////////////// DEBUG triangles ///////////////////////
					// stp ++
					///////////////////////////////////////////////////////
					
				}
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = insertFront[ n - 1 ].idx;
				g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
				
				front[ nextFront( m ) ].ang = 0;
				
				indIdx += 3;
				
				/////////////// DEBUG triangles ///////////////////////
				// stp ++
				///////////////////////////////////////////////////////
				
				replaceFront( m, insertFront ); // replaces front[ m ] with new points
				
			}
			
		}
		
		function makeLastTriangle( ) {
			
			g.indices[ indIdx     ] = front[ 2 ].idx;
			g.indices[ indIdx + 1 ] = front[ 1 ].idx 
			g.indices[ indIdx + 2 ] = front[ 0 ].idx;
			
			indIdx += 3;
			
			/////////////// DEBUG triangles ///////////////////////
			// stp ++
			///////////////////////////////////////////////////////
			
			front = [];
			
			fronts[ frontNo ] = [];
			
			frontStock -= 1; // close front
			
		}
		
		function chooseNextFront ( ) {
			
			if ( frontStock > 0 ) {
				
				for ( let i = 0; i < fronts.length; i ++ ) {
					
					if ( fronts[ i ].length > 0 ) {
						
						frontNo = i;
						break;
						
					}
					
				}
				
				front = fronts[ frontNo ];
				
				smallAngles = [];
				
				for ( let i = 0; i < front.length; i ++ ) {
					
					calculateFrontAngle( i ); // recalculate angles of next front
					
				}
				
			}
			
		}
		
		function calculateSurfacePointAndNormal( ) {
			
			xp = xc + Math.cos( phi ) * d * xt1 + Math.sin( phi ) * d * xt2;
			yp = yc + Math.cos( phi ) * d * yt1 + Math.sin( phi ) * d * yt2;
			zp = zc + Math.cos( phi ) * d * zt1 + Math.sin( phi ) * d * zt2;
			
			iterationNewton ( ); 
			
			g.positions[ posIdx     ] = xp;
			g.positions[ posIdx + 1 ] = yp;
			g.positions[ posIdx + 2 ] = zp;
			
			g.normals[ posIdx     ] = xn;
			g.normals[ posIdx + 1 ] = yn;
			g.normals[ posIdx + 2 ] = zn;
			
		}
		
		function iterationNewton ( ) {
			
			let xp0, yp0, zp0;
			
			xp0 = xp;
			yp0 = yp;
			zp0 = zp;
			
			newtonStep( );
			
			while ( length( xp0 - xp, yp0 - yp, zp0 - zp  ) > e ) {
				
				xp0 = xp;
				yp0 = yp;
				zp0 = zp;
				
				newtonStep( );
				
			}
			
			len = length( xn, yn, zn ); // to normalize
			
			xn = xn / len;
			yn = yn / len;
			zn = zn / len;
			
		}
		
		function newtonStep( ) {
			
			let cc, t;
			
			xn = dx( xp, yp, zp );
			yn = dy( xp, yp, zp );
			zn = dz( xp, yp, zp );
			
			cc = xn * xn + yn * yn + zn * zn;
			
			if ( cc > e * e ) {
				
				t = -isf( xp, yp, zp ) / cc;
				
			} else {
				
				t = 0;
				console.log( 'WARNING tri (surface_point...): newton')
				
			}
			
			xp = xp + t * xn;
			yp = yp + t * yn;
			zp = zp + t * zn;
			
		}
		
		function atan2PI( x, y ) {
			
			let phi = Math.atan2( y, x );
			
			if ( phi < 0 ) phi = phi + Math.PI * 2;
			
			return phi;
			
		}
		
		function coordTangentialSystem( ) {
			
			let det = determinant( xt1, yt1, zt1, xt2, yt2, zt2, xn, yn, zn );
			
			xs1 = determinant( x1 - xp, y1 - yp, z1 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
			ys1 = determinant( xt1, yt1, zt1, x1 - xp, y1 - yp, z1 - zp, xn, yn, zn ) / det;
			//zs1 = determinant( xt1, yt1, zt1, xt2, yt2, zt2, x1 - xp, y1 - yp, z1 - zp ) / det; // not needed
			
			xs2 = determinant( x2 - xp, y2 - yp, z2 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
			ys2 = determinant( xt1, yt1, zt1, x2 - xp, y2 - yp, z2 - zp, xn, yn, zn ) / det;
			//zs2 = determinant( xt1, yt1, zt1, xt2, yt2, zt2, x2 - xp, y2 - yp, z2 - zp ) / det; // not needed
			
		}
		
		function calculateFrontAngle( i ) {
			
			let ang1, ang2;
			
			getPrevPoint( i ); // (1)
			getPoint( i );
			getNextPoint( i ); // (2)
			
			coordTangentialSystem( );
			
			ang1 = atan2PI( xs1, ys1 );
			ang2 = atan2PI( xs2, ys2 );
			
			if ( ang2 < ang1 )  ang2 += Math.PI * 2;
			
			front[ i ].ang  = ang2 - ang1;
			
			if ( front[ i ].ang < 1.5 ) smallAngles.push( i );
			
		}	
		
		function partFrontBounds( ) {
			
			let x, y, z, idx, xmin, ymin, zmin, xmax, ymax, zmax;
			
			partBounds = [];
			
			xmin = ymin = zmin = Infinity;
			xmax = ymax = zmax = -Infinity;
			
			for( let i = 0; i < partFront.length; i ++ ) {
				
				idx = partFront[ i ].idx * 3;
				
				x = g.positions[ idx ]; 
				y = g.positions[ idx + 1 ];
				z = g.positions[ idx + 2 ];
				
				xmin = x < xmin ? x : xmin; 
				ymin = y < ymin ? y : ymin;
				zmin = z < zmin ? z : zmin;
				
				xmax = x > xmax ? x : xmax;
				ymax = y > ymax ? y : ymax;
				zmax = z > zmax ? z : zmax;
				
			}
			
			partBounds.push( xmin, ymin, zmin, xmax, ymax, zmax );
			
			boundings.push( partBounds );
			
		}
		
		function replaceFront( m, fNew ) {
			
			let rear = front.splice( m, front.length - m );
			
			for ( let i = 0; i < fNew.length; i ++ ) {
				
				front.push( fNew[ i ] ); // new front points
				
			}
			
			for ( let i = 1; i < rear.length; i ++ ) { // i = 1: without old front point m 
				
				front.push( rear[ i ] );
				
			}
			
		}
		
		function getNormal( i ){
			
			frontPosIdx = front[ i ].idx * 3;
			
			xn = g.normals[ frontPosIdx ]; 
			yn = g.normals[ frontPosIdx + 1 ];
			zn = g.normals[ frontPosIdx + 2 ];
			
		}
		
		function calculateTangentsPoint( ) {
			
			// cross
			
			xt2 = yn * ( z1 - zp ) - zn * ( y1 - yp );
			yt2 = zn * ( x1 - xp ) - xn * ( z1 - zp );
			zt2 = xn * ( y1 - yp ) - yn * ( x1 - xp );
			
			len = length( xt2, yt2, zt2 ); // to normalize
			
			xt2 = xt2 / len;
			yt2 = yt2 / len;
			zt2 = zt2 / len; 
			
			// cross
			xt1 = yt2 * zn - zt2 * yn;
			yt1 = zt2 * xn - xt2 * zn;
			zt1 = xt2 * yn - yt2 * xn;
			
		}
		
		function getPrevPoint( i ) {
			
			frontPosIdx = front[ prevFront( i ) ].idx * 3;
			
			x1 = g.positions[ frontPosIdx ];
			y1 = g.positions[ frontPosIdx + 1 ];
			z1 = g.positions[ frontPosIdx + 2 ];
			
		}
		
		function getPoint( i ) {
			
			frontPosIdx = front[ i ].idx * 3;
			
			xp = g.positions[ frontPosIdx ];
			yp = g.positions[ frontPosIdx + 1 ];
			zp = g.positions[ frontPosIdx + 2 ];
			
		}
		
		function getNextPoint( i ) {
			
			frontPosIdx = front[ nextFront( i ) ].idx * 3;
			
			x2 = g.positions[ frontPosIdx ];
			y2 = g.positions[ frontPosIdx + 1 ];
			z2 = g.positions[ frontPosIdx + 2 ];
			
		}
		
	}
	
	// +++ Variant with boundaries, somewhat more effort, absolutely necessary for infinite surfaces such as cylinders and cones. +++
	
	function triangulationBounds( isf, dx, dy, dz, xs, ys, zs, d, e, fc, pc, b ) {
		
		let	bd = b; // make compatible in function
		
		const squareLength = ( x,y,z ) => ( x*x + y*y + z*z );
		const length = ( x,y,z ) => ( Math.sqrt( x*x + y*y + z*z ) );
		const prevFront = ( i ) => ( i !== 0 ? i - 1 : front.length - 1 );
		const nextFront = ( i ) => ( i !== front.length - 1 ? i + 1 : 0 );
		const determinant = ( xa,ya,za, xb,yb,zb, xc,yc,zc ) => ( xa*yb*zc + ya*zb*xc + za*xb*yc - za*yb*xc - xa*zb*yc - ya*xb*zc );
		
		let m; // index of the current front point
		let n; // number of new points
		let nT; // number of new triangles
		let nIns; // number of new points (after union or split)
		let dAng; // partial angle
		let phi; // angle (new points)
		let len, d1, d2, d12; // lengths
		let iSplit, jSplit; // split front indices  
		let iUnite, jUnite, fUnite; // unite front indices, front number (to unite) 
		
		// points and vectors:
		let xp, yp, zp; // actual point p
		let x1, y1, z1, x2, y2, z2; // previous and next point to p in front
		let xn, yn, zn; // partial derivations on point p, normal, gradient
		let xt1, yt1, zt1, xt2, yt2, zt2; // tangents
		let xs1, ys1, xs2, ys2; // p in tangential system (only x, y required)
		let xc, yc, zc; // actual point as center point for new points
		
		let bdPoint = false; // if border point 
		
		//  preparation
		
		g.indices = new Uint32Array( fc * 3 );
		g.positions = new Float32Array( pc * 3 );
		g.normals = new Float32Array( pc * 3 );
		
		g.setIndex( new THREE.BufferAttribute( g.indices, 1 ) );
		g.addAttribute( 'position', new THREE.BufferAttribute( g.positions, 3 ) );
		g.addAttribute( 'normal', new THREE.BufferAttribute( g.normals, 3 ) );
		
		let posIdx = 0;
		let indIdx = 0;
		let frontPosIdx, unionIdxA, unionIdxB, splitIdx;
		
		let front = []; // active front // front[ i ]: object { idx: 0, ang: 0, bou: false } // bou:  boundary point
		let partFront = []; // separated part of the active front (to split)
		let insertFront = []; // new front points to insert into active front
		let fronts = []; // all fronts
		let partBounds = []; // bounding box of partFront [ xmin, ymin, zmin, xmax, ymax, zmax ]
		let boundings = []; // fronts bounding boxes
		let smallAngles = []; // new angles < 1.5
		
		let unite = false;
		let split = false;
		
		let dd = d * d;
		
		fronts.push( [] );
		boundings.push( [] );
		
		let frontStock = 0; // number of fronts still to be processed
		let frontNo = 0;
		front = fronts[ frontNo ];
		
		let pCount; // count available points in active front
		
		///////////////////// DEBUG triangles /////////////////////////
		// let stp = 0; 
		///////////////////////////////////////////////////////////////
		
		makeFirstTriangle( ); // first triangle creates a front
		
		// ------ triangulation cycle -------------
		
		while ( frontStock > 0 ) {	
			
			if (  !unite && !split ) { // triangulation on the front
				
				smallAngles = [];
				
				for ( let i = 0; i < front.length; i ++ ) {
					
					// is to be recalculated (angle was set to zero, not for boundary point)
					if( front[ i ].ang === 0 && !front[ i ].bou ) calculateFrontAngle( i ); 
					
				}
				
				m = getMinimalAngleIndex( ); // front angle
				makeNewTriangles( m );
				
				if ( front.length > 9 && smallAngles.length === 0 ) {
					
					checkDistancesToUnite( m );
					checkDistancesToSplit( m );
					
				}
				
				pCount = 0;
				
				for ( let i = 0; i < front.length; i ++ ) {
					
					if ( !front[ i ].bou ) pCount ++; // count available points (means no boundary point)
					
				}
				
				if ( front.length === 3 || pCount === 0 ) { // close front
					
					if ( front.length === 3 ) makeLastTriangle( );
					
					front = [];
					fronts[ frontNo ] = [];
					frontStock -= 1;
					chooseNextFront( ); // if available
					
				}
				
			} else {
				
				// unite the active front to another front or split the active front
				
				if ( unite ) {
					
					uniteFront(  m, iUnite, fUnite, jUnite );
					trianglesAtUnionPoints( );
					
					unite = false;
					
				} else if ( split ) {
					
					splitFront( iSplit, jSplit );
					trianglesAtSplitPoints( );
					split = false;
					
				}
				
			}
			
			/////////////// DEBUG triangles /////////////////////
			// if ( stp > 500 ) break;
			///////////////////////////////////////////////////////
			
		}
		
		// .....  detail functions .....
		
		function makeFirstTriangle( ) {
			
			xp = xs;
			yp = ys;
			zp = zs;
			
			iterationNewton( );
			
			// first point
			g.positions[ posIdx     ] = xp;
			g.positions[ posIdx + 1 ] = yp;
			g.positions[ posIdx + 2 ] = zp;
			
			// first normal
			g.normals[ posIdx     ] = xn;
			g.normals[ posIdx + 1 ] = yn;
			g.normals[ posIdx + 2 ] = zn;
			
			front.push( { idx: posIdx / 3, ang: 0, bou: false } ); // first front point, no boundary point
			
			posIdx += 3;
			
			// start point neighbour
			x1 = xs + d / 32;
			y1 = ys + d / 32;
			z1 = zs + d / 32;
			
			calculateTangentsPoint( ); // start point and neighbour
			
			xc = xp;
			yc = yp;
			zc = zp;
			
			phi = 0;
			
			for ( let i = 0; i < 2; i ++ ) {
				
				calculateSurfacePointAndNormal( );
				
				front.push( { idx: posIdx / 3, ang: 0, bou: false } ); 
				
				posIdx += 3;
				
				phi += Math.PI / 3;
				
			}
			
			g.indices[ indIdx     ] = 0;
			g.indices[ indIdx + 1 ] = 1;
			g.indices[ indIdx + 2 ] = 2;
			
			indIdx += 3;
			
			frontStock += 1;
			
		}
		
		function checkDistancesToUnite( m ) { // for new active front points
			
			let idxJ, xChk, yChk, zChk, ddUnite;
			let ddUniteMin = Infinity;
			unite = false;
			
			for ( let i = 0; i < insertFront.length; i ++ ) {
				
				if ( !front[ m + i ].bou ) {  // not for boundary point
					
					getPoint( m + i );
					
					for ( let f = 0; f < fronts.length; f ++ ) {
						
						if ( f !== frontNo ) {
							
							xChk = ( xp > boundings[ f ][ 0 ] - d ) && ( xp < boundings[ f ][ 3 ] + d );
							yChk = ( yp > boundings[ f ][ 1 ] - d ) && ( yp < boundings[ f ][ 4 ] + d );
							zChk = ( zp > boundings[ f ][ 2 ] - d ) && ( zp < boundings[ f ][ 5 ] + d );
							
							if (  xChk || yChk || zChk ) {
								
								for ( let j = 0; j < fronts[ f ].length; j ++ ) {
									
									if ( !fronts[ f ][ j ].bou ) { // not for boundary point
										
										idxJ = fronts[ f ][ j ].idx * 3;
										
										// Hint: here (2) is exceptionally point in other front!
										x2 = g.positions[ idxJ ]; 
										y2 = g.positions[ idxJ + 1 ];
										z2 = g.positions[ idxJ + 2 ];
										
										ddUnite = squareLength ( x2 - xp, y2 - yp, z2 - zp );
										
										if ( ddUnite < dd && ddUnite < ddUniteMin ) {
											
											ddUniteMin = ddUnite;
											iUnite = i;
											jUnite = j;
											fUnite = f;
											unite = true;
											
										}
										
									}
									
								}
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
		function uniteFront( m, i, f, j ) {
			
			let tmp = [];
			
			tmp[ 0 ] = front.slice( 0, m + i + 1 );	
			tmp[ 1 ] = fronts[ f ].slice( j , fronts[ f ].length );
			tmp[ 2 ] = fronts[ f ].slice( 0 , j + 1 );
			tmp[ 3 ] = front.slice( m + i, front.length );
			
			unionIdxA = m + i;
			unionIdxB = m + i + 1 + fronts[ f ].length
			
			front = [];
			
			for ( let t = 0; t < 4; t ++ ) {
				
				for ( let k = 0; k < tmp[ t ].length ; k ++ ) {
					
					front.push( tmp[ t ][ k ] );
					
				}
				
			}
			
			fronts[ f ] = []; // empty united front
			
			frontStock -= 1; // front is eliminated
			
		}
		
		function trianglesAtUnionPoints( ) {
			
			nIns = 0; // count inserted points
			
			calculateFrontAngle( unionIdxA );
			calculateFrontAngle( unionIdxA + 1 );
			
			if ( front[ unionIdxA ].ang < front[ unionIdxA + 1 ].ang ) {
				
				makeNewTriangles( unionIdxA );
				nIns += n - 1;
				calculateFrontAngle( unionIdxA + 1 + nIns );
				makeNewTriangles( unionIdxA + 1 + nIns );
				nIns += n - 1;
				
			} else {
				
				makeNewTriangles( unionIdxA + 1 );
				nIns += n - 1;
				calculateFrontAngle( unionIdxA );
				makeNewTriangles( unionIdxA );
				nIns += n - 1;
			}
			
			calculateFrontAngle( unionIdxB + nIns );
			calculateFrontAngle( unionIdxB + 1 + nIns );
			
			if ( front[ unionIdxB + nIns ].ang < front[ unionIdxB + 1 + nIns ].ang ) {
				
				makeNewTriangles( unionIdxB + nIns );
				nIns += n - 1;
				calculateFrontAngle( unionIdxB + 1 + nIns );
				makeNewTriangles( unionIdxB + 1 + nIns );
				
			} else {
				
				makeNewTriangles( unionIdxB + 1 + nIns );
				calculateFrontAngle( unionIdxB + nIns );
				makeNewTriangles( unionIdxB + nIns );
				
			}
			
		}
		
		function checkDistancesToSplit( m ) { // for new active front points
			
			let mj, mjIdx, ddSplit;
			let ddSplitMin = Infinity;
			split = false;
			
			for ( let i = 0; i < front.length ; i ++ ) {
				
				if ( !front[ i ].bou ) { // not for boundary point
					
					for ( let j = 0; j < n; j ++ ) { // check n new points (insertFront)
						
						mj = m + j;
						
						// except new points themselves, neighbor and boundary points
						if ( Math.abs( i - mj ) > 3 && Math.abs( i - mj ) < front.length - 3 && !front[ mj ].bou ) {
							
							mjIdx = front[ mj ].idx * 3;
							
							// Hint: here (1) is exceptionally new point in the front!
							x1 = g.positions[ mjIdx ];
							y1 = g.positions[ mjIdx + 1 ];
							z1 = g.positions[ mjIdx + 2 ];
							
							getPoint( i );
							
							ddSplit = squareLength ( x1 - xp, y1 - yp, z1 - zp );
							
							if ( ddSplit < dd && ddSplit < ddSplitMin ) {
								
								ddSplitMin = ddSplit;
								iSplit = i;
								jSplit = mj;
								split = true;
								
							}
							
						}
						
					}
					
				}
				
			}
			
		}
		
		function splitFront( iSplit, jSplit ) {
			
			let k;
			
			front[ iSplit ].ang = 0;
			front[ jSplit ].ang = 0;
			
			if ( iSplit > jSplit )  { // swap
				
				k = jSplit;
				jSplit = iSplit;
				iSplit = k;
				
			} 
			
			splitIdx = iSplit;	// lower index
			
			partFront = [];
			
			// to duplicate
			let frontI = front[ iSplit ];
			let frontJ = front[ jSplit ];
			
			partFront = front.splice( iSplit + 1, jSplit - iSplit - 1 );
			partFront.unshift( frontI );
			partFront.push( frontJ );
			
			fronts.push( partFront );
			
			partFrontBounds( );
			
			frontStock += 1; // new front created
			
		}
		
		function trianglesAtSplitPoints( ) {
			
			nIns = 0; // count inserted points
			
			let idx0 = splitIdx; // splitIdx is the lower index 
			let idx1 = splitIdx + 1;
			
			calculateFrontAngle( idx0 );
			calculateFrontAngle( idx1 );
			
			if ( front[ idx1 ].ang < front[ idx0 ].ang ){
				
				makeNewTriangles( idx1 );
				nIns += n - 1;
				calculateFrontAngle( idx0 );
				makeNewTriangles( idx0 );
				
			} else {
				
				makeNewTriangles( idx0 );
				nIns += n - 1;
				calculateFrontAngle( idx1 + nIns );
				makeNewTriangles( idx1 + nIns );
				
			}
			
		}
		
		function getMinimalAngleIndex( ) {
			
			let angle = Infinity;
			let m;
			
			for ( let i = 0; i < front.length; i ++ ) {
				
				if( front[ i ].ang < angle && !front[ i ].bou ) { // not for boundary point
					
					angle = front[ i ].ang ;
					m = i;
					
				}
				
			}
			
			return m;
			
		}
		
		function makeNewTriangles( m ) {
			
			insertFront = []; // new front points
			
			nT = Math.floor( 3 * front[ m ].ang / Math.PI ) + 1; // number of new triangles
			
			dAng = front[ m ].ang / nT;
			
			getPrevPoint( m );
			getPoint( m );
			getNextPoint( m );
			getNormal( m );
			
			calculateTangentsPoint( );
			
			d1 = length( x1 - xp, y1 - yp, z1 - zp );
			d2 = length( x2 - xp, y2 - yp, z2 - zp );
			
			d12 = length( x2 - x1, y2 - y1, z2 - z1 );
			
			// correction of dAng, nT in extreme cases
			
			if ( dAng < 0.8 && nT > 1 ) {
				
				nT --;
				dAng = front[ m ].ang / nT;
				
			}
			
			if ( dAng > 0.8 && nT === 1 && d12 > 1.25 * d ) {
				
				nT = 2; 
				dAng = front[ m ].ang / nT;
				
			}
			
			if ( d1 * d1 < 0.2 * d * d ||  d2 * d2 < 0.2 * d * d  ) {
				
				nT = 1;
				
			}
			
			n = nT - 1;  // n number of new points
				
			if ( n === 0 ) { // one triangle
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx;
				g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
				
				indIdx += 3;
				
				/////////////// DEBUG triangles ///////////////////////
				// stp ++
				///////////////////////////////////////////////////////
				
				front[ prevFront( m ) ].ang = 0;
				front[ nextFront( m ) ].ang = 0;
				
				front.splice( m, 1 ); // delete point with index m from the front
				
			} else { // more then one triangle
				
				// point p is center of circle in tangent plane
				
				xc = xp;
				yc = yp;
				zc = zp;
				
				phi = dAng; // start angle in tangential system
				
				for ( let i = 0 ; i < n; i ++ ) {
					
					bdPoint = false; // no boundary point
					
					calculateSurfacePointAndNormal( );
					
					// check bounds, new calculation in boundary plane
					
					if( xp > bd[ 0 ] || xp < bd[ 1 ] || yp > bd[ 2 ] || yp < bd[ 3 ] || zp > bd[ 4 ] || zp < bd[ 5 ] ) {
						
						bdPoint = true; // boundary point
						
						calculateSurfacePointAndNormal( );
						
					}
					
					insertFront.push( { idx: posIdx / 3, ang: 0, bou: bdPoint } );
					
					posIdx += 3;
					
					phi += dAng;
					
				}
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = front[ prevFront( m ) ].idx 
				g.indices[ indIdx + 2 ] = insertFront[ 0 ].idx;
				
				indIdx += 3;
				
				/////////////// DEBUG triangles ///////////////////////
				// stp ++
				///////////////////////////////////////////////////////
				
				front[ prevFront( m ) ].ang = 0;
				
				for ( let i = 0; i < n - 1; i ++ ) {
					
					g.indices[ indIdx     ] = front[ m ].idx;
					g.indices[ indIdx + 1 ] = insertFront[ i ].idx;
					g.indices[ indIdx + 2 ] = insertFront[ i + 1 ].idx;
					
					indIdx += 3;
					
					/////////////// DEBUG triangles ///////////////////////
					// stp ++
					///////////////////////////////////////////////////////
					
				}
				
				g.indices[ indIdx     ] = front[ m ].idx;
				g.indices[ indIdx + 1 ] = insertFront[ n - 1 ].idx;
				g.indices[ indIdx + 2 ] = front[ nextFront( m ) ].idx;
				
				front[ nextFront( m ) ].ang = 0;
				
				indIdx += 3;
				
				/////////////// DEBUG triangles ///////////////////////
				// stp ++
				///////////////////////////////////////////////////////
				
				replaceFront( m, insertFront ); // replaces front[ m ] with new points
				
			}
			
		}
		
		function makeLastTriangle( ) {
			
			g.indices[ indIdx     ] = front[ 2 ].idx;
			g.indices[ indIdx + 1 ] = front[ 1 ].idx 
			g.indices[ indIdx + 2 ] = front[ 0 ].idx;
			
			indIdx += 3;
			
			/////////////// DEBUG triangles ///////////////////////
			// stp ++;
			///////////////////////////////////////////////////////
			
			front = [];
			
			fronts[ frontNo ] = [];
			
			frontStock -= 1; // close front
			
		}
		
		function chooseNextFront( ) {
			
			if ( frontStock > 0 ) {
				
				for ( let i = 0; i < fronts.length; i ++ ) {
					
					if ( fronts[ i ].length > 0 ) {
						
						frontNo = i;
						break;
						
					}
					
				}
				
				front = fronts[ frontNo ];
				
				smallAngles = [];
				
				for ( let i = 0; i < front.length; i ++ ) {
					
					calculateFrontAngle( i ); // recalculate angles of next front
				
				}
				
			}
			
		}
		
		function calculateSurfacePointAndNormal( ) {
			
			if( !bdPoint ) {
				
				xp = xc + Math.cos( phi ) * d * xt1 + Math.sin( phi ) * d * xt2;
				yp = yc + Math.cos( phi ) * d * yt1 + Math.sin( phi ) * d * yt2;
				zp = zc + Math.cos( phi ) * d * zt1 + Math.sin( phi ) * d * zt2;
				
			} else { // for boundary points
				
				xp = xp > bd[ 0 ] ? bd[ 0 ] : xp;
				xp = xp < bd[ 1 ] ? bd[ 1 ] : xp;
				yp = yp > bd[ 2 ] ? bd[ 2 ] : yp;
				yp = yp < bd[ 3 ] ? bd[ 3 ] : yp;
				zp = zp > bd[ 4 ] ? bd[ 4 ] : zp;
				zp = zp < bd[ 5 ] ? bd[ 5 ] : zp;
				
			}
			
			iterationNewton ( ); 
			
			g.positions[ posIdx     ] = xp;
			g.positions[ posIdx + 1 ] = yp;
			g.positions[ posIdx + 2 ] = zp;
			
			g.normals[ posIdx     ] = xn;
			g.normals[ posIdx + 1 ] = yn;
			g.normals[ posIdx + 2 ] = zn;
			
		}
		
		function iterationNewton ( ) {
			
			let xp0, yp0, zp0;
			
			xp0 = xp;
			yp0 = yp;
			zp0 = zp;
			
			newtonStep( );
			
			while ( length( xp0 - xp, yp0 - yp, zp0 - zp  ) > e ) {
				
				xp0 = xp;
				yp0 = yp;
				zp0 = zp;
				
				newtonStep( );
				
			}
			
			len = length( xn, yn, zn ); // to normalize
			
			xn = xn / len;
			yn = yn / len;
			zn = zn / len;
			
		}
		
		function newtonStep( ) {
			
			let cc, t;
			
			if( !bdPoint ) {
				
				xn = dx( xp, yp, zp );
				yn = dy( xp, yp, zp );
				zn = dz( xp, yp, zp );
				
			} else { // for boundary points
				
				xn = ( xp === bd[ 0 ] || xp === bd[ 1 ] ) ? 0 : dx( xp, yp, zp );
				yn = ( yp === bd[ 2 ] || yp === bd[ 3 ] ) ? 0 : dy( xp, yp, zp );
				zn = ( zp === bd[ 4 ] || zp === bd[ 5 ] ) ? 0 : dz( xp, yp, zp );
				
			}
			
			cc = xn * xn + yn * yn + zn * zn;
			
			if ( cc > e * e ) {
				
				t = -isf( xp, yp, zp ) / cc;
				
			} else {
				
				t = 0;
				console.log( 'WARNING tri (surface_point...): newton')
				
			}
			
			xp = xp + t * xn;
			yp = yp + t * yn;
			zp = zp + t * zn;
			
		}
		
		function atan2PI( x, y ) {
			
			let phi = Math.atan2( y, x );
			
			if ( phi < 0 ) phi = phi + Math.PI * 2;
			
			return phi;
			
		}
		
		function coordTangentialSystem( ) {
			
			let det = determinant( xt1, yt1, zt1, xt2, yt2, zt2, xn, yn, zn );
			
			xs1 = determinant( x1 - xp, y1 - yp, z1 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
			ys1 = determinant( xt1, yt1, zt1, x1 - xp, y1 - yp, z1 - zp, xn, yn, zn ) / det;
			//zs1 = determinant( xt1, yt1, zt1, xt2, yt2, zt2, x1 - xp, y1 - yp, z1 - zp ) / det; // not needed
			
			xs2 = determinant( x2 - xp, y2 - yp, z2 - zp, xt2, yt2, zt2, xn, yn, zn ) / det;
			ys2 = determinant( xt1, yt1, zt1, x2 - xp, y2 - yp, z2 - zp, xn, yn, zn ) / det;
			//zs2 = determinant( xt1, yt1, zt1, xt2, yt2, zt2, x2 - xp, y2 - yp, z2 - zp ) / det; // not needed
			
		}
		
		function calculateFrontAngle( i ) {
			
			let ang1, ang2;
			
			getPrevPoint( i ); // (1)
			getPoint( i );
			getNextPoint( i ); // (2)
			
			coordTangentialSystem( );
			
			ang1 = atan2PI( xs1, ys1 );
			ang2 = atan2PI( xs2, ys2 );
			
			if ( ang2 < ang1 )  ang2 += Math.PI * 2;
			
			front[ i ].ang  = ang2 - ang1;
			
			if ( front[ i ].ang < 1.5 ) smallAngles.push( i );
			
		}	
		
		function partFrontBounds( ) {
			
			let x, y, z, idx, xmin, ymin, zmin, xmax, ymax, zmax;
			
			partBounds = [];
			
			xmin = ymin = zmin = Infinity;
			xmax = ymax = zmax = -Infinity;
			
			for( let i = 0; i < partFront.length; i ++ ) {
				
				idx = partFront[ i ].idx * 3;
				
				x = g.positions[ idx ]; 
				y = g.positions[ idx + 1 ];
				z = g.positions[ idx + 2 ];
				
				xmin = x < xmin ? x : xmin; 
				ymin = y < ymin ? y : ymin;
				zmin = z < zmin ? z : zmin;
				
				xmax = x > xmax ? x : xmax;
				ymax = y > ymax ? y : ymax;
				zmax = z > zmax ? z : zmax;
				
			}
			
			partBounds.push( xmin, ymin, zmin, xmax, ymax, zmax );
			
			boundings.push( partBounds );
			
		}
		
		function replaceFront( m, fNew ) {
			
			let rear = front.splice( m, front.length - m );
			
			for ( let i = 0; i < fNew.length; i ++ ) {
				
				front.push( fNew[ i ] ); // new front points
				
			}
			
			for ( let i = 1; i < rear.length; i ++ ) { // i = 1: without old front point m 
				
				front.push( rear[ i ] );
				
			}
			
		}
		
		function getNormal( i ){
			
			frontPosIdx = front[ i ].idx * 3;
			
			xn = g.normals[ frontPosIdx ];
			yn = g.normals[ frontPosIdx + 1 ];
			zn = g.normals[ frontPosIdx + 2 ];
			
		}
		
		function calculateTangentsPoint( ) {
			
			// cross
			
			xt2 = yn * ( z1 - zp ) - zn * ( y1 - yp );
			yt2 = zn * ( x1 - xp ) - xn * ( z1 - zp );
			zt2 = xn * ( y1 - yp ) - yn * ( x1 - xp );
		
			len = length( xt2, yt2, zt2 ); // to normalize
			
			xt2 = xt2 / len;
			yt2 = yt2 / len;
			zt2 = zt2 / len;
			
			// cross
			xt1 = yt2 * zn - zt2 * yn;
			yt1 = zt2 * xn - xt2 * zn;
			zt1 = xt2 * yn - yt2 * xn;
			
		}
			
		function getPrevPoint( i ) {
			
			frontPosIdx = front[ prevFront( i ) ].idx * 3;
			
			x1 = g.positions[ frontPosIdx ];
			y1 = g.positions[ frontPosIdx + 1 ];
			z1 = g.positions[ frontPosIdx + 2 ];
			
		}
		
		function getPoint( i ) {
			
			frontPosIdx = front[ i ].idx * 3;
			
			xp = g.positions[ frontPosIdx ];
			yp = g.positions[ frontPosIdx + 1 ];
			zp = g.positions[ frontPosIdx + 2 ];
			
		}
		
		function getNextPoint( i ) {
			
			frontPosIdx = front[ nextFront( i ) ].idx * 3;
			
			x2 = g.positions[ frontPosIdx ];
			y2 = g.positions[ frontPosIdx + 1 ];
			z2 = g.positions[ frontPosIdx + 2 ];
			
		}
		
	}
	
}

exports.createImplicitSurface = createImplicitSurface;
exports.buildImplicitSurface = buildImplicitSurface;

// ......................................   -   ..................................................

//#################################################################################################

Object.defineProperty(exports, '__esModule', { value: true });

})));