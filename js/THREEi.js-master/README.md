# THREEi
three.js addon for triangulation of implicit surfaces and for forms with holes. The addon generates indexed BufferGeometries.

*License identical to three.js*

#### Algorithmus nach / Algorithm based on E. Hartmann.

The algorithm was originally implemented in Pascal and visualized with POV-Ray.

The implementation of the algorithm with three.js/JavaScript deviates from the template in some places.

de: https://www2.mathematik.tu-darmstadt.de/~ehartmann/cdg0/cdg0n.pdf

en: https://www2.mathematik.tu-darmstadt.de/~ehartmann/cdgen0104.pdf

siehe / see

de: https://de.wikipedia.org/wiki/Implizite_Fl%C3%A4che

en: https://en.wikipedia.org/wiki/Implicit_surface

@author hofk / http://sandbox.threejs.hofk.de/ or http://sandboxthreei.threejs.hofk.de/

----------------------------------------------------------

Replace from revision 110 .addAttribute with .setAttribute.

For more efficiency.

Each single geometry section between ............................. name ............................. can be deleted.

.................................................................... Sphere with Holes (Triangulation)  ..............................................................................

Sphere with arbitrarily arranged openings, circular or defined by points on the sphere.
The geometry is realized as indexed BufferGeometry.

Algorithm simplified and modified for sphere. 

There are two variants that are distinguished by the parameters.

#### 1.

Parameters object  { d: div4: holes: } all elements optional

d: rough side length of the triangles, (for exact adjustment of different shapes)

div4: divisions of the quarter of the great circle, (radius = d / Math.sin( Math.PI / ( div4 * 4 )) / 2 )

holes: array of arrays of holes (definition of the holes in the two variants different!)

#### 2.

Variant with less effort in the algorithm! Other angle calculation too.

One parameter and one optional parameter: detail, (holes) 

Sphere with fixed radius 1 (use three.js .scale) and specifying detail and optional holes (array of arrays of holes).

The rough side length of the triangles is Math.PI / detail.

```javascript

const g = new THREE.BufferGeometry( );
g.createSphereWithHoles = THREEi.createSphereWithHoles;

g.createSphereWithHoles( parameterObject ); // variant 1.
// or
g.createSphereWithHoles( detail ); // variant 2.
// or
g.createSphereWithHoles( detail, holes ); // variant 2.

 ``` 

####  EXAMPLES:

#### 1.

```javascript

const g = new THREE.BufferGeometry( );	
const parameters = {	
	d: 0.07, // rough side length of the triangles, radius calculated from d and div4 
	div4: 25, // division of the quarter of the great circle (orthodrome) 
	holes: [
		// circular hole, 3 elements: [ theta, phi, div4Hole ], div4Hole <= div4	
		[ 1.57, -0.25,  9 ],
		[ 0.44,  4.84, 18 ],
		[ 1.23,  1.62, 11 ],
		// points hole,: array of points theta, phi, ...  (last point is connected to first)
		[ 1.7,-1.2,  1.7,-2.1,  2.6,-2.1 ]
	]
}

g.createSphereWithHoles = THREEi.createSphereWithHoles;
g.createSphereWithHoles( parameters ); // parameter object

const material = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: 0x000000, wireframe: true } );
const mesh = new THREE.Mesh( g, material );
scene.add( mesh );

 ``` 

#### 2.

```javascript

const g = new THREE.BufferGeometry( );
const detail = 50;
const holes = [
	// circular hole, 3 elements: [ theta, phi, count ]
	[ 2.44,  0.41, 12 ],
	[ 0.72,  2.55, 19 ],
	[ 1.32, -2.15, 62 ],
	[ 1.82,  0.11, 16 ],
	[ 1.21,  1.23, 13 ],
	[ 2.44,  1.84, 25 ],
	[ 3.05,  3.22, 21 ],
	[ 2.42, -2.61, 14 ],
	// points hole,: array of points theta, phi, ...  (last point is connected to first)
	[ 0,0,  0.5,-0.8,  0.25,-0.27,  0.4,0.3,  0.3,0.72 ]
];

g.createSphereWithHoles = THREEi.createSphereWithHoles;
//g.createSphereWithHoles( detail );
g.createSphereWithHoles( detail, holes );

const material = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: 0x000000, wireframe: true } );
const mesh = new THREE.Mesh( g, material );
scene.add( mesh );

 ``` 
NOTE!  The version
#### THREEi_ONLY_SphereWithSomeHoles.js #### 
contains only the older, simpler and less expensive version of the sphere with holes.

This version contains only the older, simplified functions
 * buildSphereWithHolesObj, buildSphereWithHoles( ),
 * this requires less effort in code and execution,
 * but
 #### does not check whether the current front overlaps, ##### 
 * in very many cases with few holes this is not a problem,
 * it can lead to errors in more complicated cases
 
---

.................................................................... Cylinder with Holes (Triangulation)  ..............................................................................

Cylinder with arbitrarily arranged openings, circular ( deformed) or defined by points on the cylinder.
The geometry is realized as indexed BufferGeometry.

Algorithm modified for cylinder. 

```javascript

const g = new THREE.BufferGeometry( );
g.createCylinderWithHoles = THREEi.createCylinderWithHoles;
g.createCylinderWithHoles( parameters );

 ``` 

####  EXAMPLE:

```javascript
const g = new THREE.BufferGeometry( );

const parameters =  {
 // Example of entries
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
}
g.createCylinderWithHoles = THREEi.createCylinderWithHoles;
g.createCylinderWithHoles( parameters );

const material1 = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: 0x000000, wireframe: true, transparent: true, opacity: 0.99 } );
const mesh1 = new THREE.Mesh( g, material1 );
scene.add( mesh1 );
const material2 = new THREE.MeshBasicMaterial( { side: THREE.FrontSide, color: 0x006600, transparent: true, opacity: 0.9 } );
const mesh2 = new THREE.Mesh( g, material2 );
scene.add( mesh2 );

 ```

---

// .................................................................. Inner Geometry (Triangulation)  .........................................................................
// ............................................................ combines sphere, cylinder and other - with holes .........................................................................

Different shapes with holes can be created. For this purpose some functions of triangulation are adapted by case discrimination. 
This function then uses the appropriate mathematics for the geometry (normal, surface point …).

The geometry is realized as indexed BufferGeometry.

```javascript
const g = new THREE.BufferGeometry( );
g.createInnerGeometry = THREEi.createInnerGeometry;
g.createInnerGeometry( parameters );

 ``` 

####  EXAMPLE:

```javascript
const g = new THREE.BufferGeometry( );

const parameters = {

	// excenter unit: '%' of the radius, 'd' factor to d, 'v' value
	
	surface: 'cylinder',
	
	d: 0.3, // rough side length of the triangles
	div4: 12, // division of the quarter circle
	
	geoBtm: 'cylinder', // solid to be adapted
	btm:  -4.5,	 // NOTE! now btm and top are used 
	div4Btm: 18,
	excBtm: 0.819,
	excBtmUnit: 'v',
	
	geoTop: 'sphere', // solid to be adapted
	top: 3.2,
	div4Top: 24,	
	excTop: 2.25,
	excTopUnit: 'v',
	
	holes: [
	
		// excentric (exc) hole to conect a cylinder: [ 'cylinder', div4Adp, y, phi, exc, unit, tilt, <optional: side> ]
		[ 'cylinder', 4, 0, 0, 1.9, 'v', 0.8, '+-' ], // side is ignored for connected hole
		
	]

}

g.createInnerGeometry = THREEi.createInnerGeometry;
g.createInnerGeometry( parameters );

const material1 = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: 0x000000, wireframe: true, transparent: true, opacity: 0.99 } );
const material2 = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: 0x006600, transparent: true, opacity: 0.9 } );

const mesh1 = new THREE.Mesh( g, material1 );
scene.add( mesh1 );
const mesh2 = new THREE.Mesh( g, material2 );
scene.add( mesh2 );

 ```
Other forms see in the example folder.

---

.................................................................... Implicit Surface (Triangulation) ..............................................................................

Algorithm modified.

The implicit surfaces are defined in separate js files. See examples folder.

#### EXAMPLE

```javascript
// Example: implicit surface genus2:

const isf = ( x, y, z ) => ( 2*y*( y*y - 3*x*x )*( 1 - z*z ) + ( x*x + y*y )*( x*x + y*y ) - ( 9*z*z - 1 )*( 1 - z*z ) );// IMPLICIT SURFACE Function
const dx = ( x, y, z ) => ( -12*x*y*( 1 - z*z ) + 4*x*( x*x + y*y ) );// PARTIAL DERIVATE to x
const dy = ( x, y, z ) => ( 6*( y*y - x*x )*( 1 - z*z ) + 4*y*( x*x + y*y ) );// PARTIAL DERIVATE to y
const dz = ( x, y, z ) => ( -4*y*( y*y - 3*x*x )*z + 36*z*z*z - 20*z );// PARTIAL DERIVATE to z

const xs = 0; // x START POINT
const ys = 3; // y START POINT
const zs = 0; // z START POINT

const d = 0.08; // rough edge length of triangles
const e = 0.001; // epsilon 


 ``` 

genus2.png
![genus2.png](https://github.com/hofk/THREEi.js/blob/master/genus2.png)

The starting point ( xs, ys ,zs ) must be close to the surface.

The rough edge length of triangles d must be sufficiently small in relation to the strongest curvature. 

Furthermore, a suitable accuracy number e (epsilon) must be selected.

If the values do not match, the Newton's method does not converge.

```html
<script src="../js/three.min.107.js"></script>
<script src="../js/OrbitControls.js"></script>
<script src="../js/THREEi.js"></script>

<!-- rename the example
	<script src="implicitSurface example.js"></script>
 -->
<script src="implicitSurface genus2.js"></script>

 ```
 
```javascript

const g = new THREE.BufferGeometry( );
g.createImplicitSurface = THREEi.createImplicitSurface;
// use version (A) with opt for infinite surfaces such as cylinders and cones or for cuts
	/*opt optional object, all properties also optional
		{ 	
			fc:  faces //( max. number of triangles )
			pc:  positions // ( max. number of points )
			b:   bounds //  array [ xMax, xMin, yMax, yMin, zMax, zMin ]
		}
	*/

// (A) parameters from implicitSurface example.js, with object of optional parameters, contains bounds 
g.createImplicitSurface( isf, dx, dy, dz, xs, ys, zs, d, e, opt );

// (B) parameters from implicitSurface example.js with some default values
//g.createImplicitSurface( isf, dx, dy, dz, xs, ys, zs, d, e );

const material1 = new THREE.MeshBasicMaterial( { side: THREE.DoubleSide, color: 0x000000, wireframe: true, transparent: true, opacity: 0.99 } );
const mesh1 = new THREE.Mesh( g, material1 );
scene.add( mesh1 );
const material2 = new THREE.MeshBasicMaterial( { side: THREE.FrontSide, color: 0x006600, transparent: true, opacity: 0.9 } );
const mesh2 = new THREE.Mesh( g, material2 );
scene.add( mesh2 );


 ``` 
 
*The addon THREEi.js capsules the functions*

	*triangulation( isf, dx, dy, dz, xs, ys, zs, d, e, fc, pc )*
	
	*triangulationBounds( isf, dx, dy, dz, xs, ys, zs, d, e, fc, pc, b ) with boundaries*

*These can be copied and directly integrated into your own projects.*

*Variant with boundaries demands some more effort, however is absolutely necessary for infinite surfaces like cylinders and cones.*
*It is also required for cut surfaces.*

The calculation of the triangles of the implicit surfaces requires some effort. 
Therefore, it may be useful to export the result of the calculation as a complete three.js BufferGeometry definition.
The file triangulationImplicitSurfaceExportGeo.html serves this purpose. See folder Examples.
If you press the export Def button, the JavaScript code is displayed and copied to the clipboard.
The ...32 arrays are shortened to the true length.
This three.js BufferGeometry definition can be inserted into the file implicitSurfaceImport.html at the marked position.
The definition can also easily be copied into your own projects.

---
