(() => {
  const THREE = window.THREE;
  const gsap = window.gsap;
  const canvas = document.getElementById('threeCanvas');
  const stage = document.getElementById('threeStage');
  const fallback = document.getElementById('threeFallback');
  if (!THREE || !gsap || !canvas) {
    if (fallback) fallback.hidden = false;
    return;
  }

  const parts = {
    chamber: { name: 'Clear filter chamber', material: 'UPVC Pipe', purpose: 'Houses the water, floating oil layer, and removable material pack, allowing users to observe the separation of floating oil and water during filtration.' },
    topcap: { name: 'Removable top cap', material: 'PVC Internal Threaded Pipe Cap', purpose: 'Covers the chamber and can be removed to access and replace the filter pack.' },
    bottomcap: { name: 'Fixed bottom cap', material: 'PVC Pipe Cap', purpose: 'Seals the base of the filter chamber to help prevent leakage.' },
    inlet: { name: 'L-shaped Connector', material: 'PVC', purpose: 'Directs wastewater into the filter chamber.' },
    outlet: { name: 'L-shaped Connector', material: 'PVC', purpose: 'Directs filtered water out of the chamber to the drain.' },
    pack: { name: 'Material pack', material: 'Cotton filter bag containing coconut fibre and biochar', purpose: 'Holds the filter media in place: Coconut fibre helps trap some oil and suspended residues, while biochar may adsorb certain contaminants; replace after two weeks.' },
    cups: { name: 'Kitchen filter net', material: 'Fine Nylon Mesh with a Polypropylene Rim', purpose: 'Traps food scraps and other solid waste at the sink hole cover.' }
  };
  // Hit areas are defined against the source photo, then mapped into the
  // actual object-fit:contain image bounds at every viewport size.
  const kitHotspots = {
    chamber: { x: 0.205, y: 0.52, w: 0.18, h: 0.29 },
    topcap: { x: 0.405, y: 0.425, w: 0.17, h: 0.12 },
    bottomcap: { x: 0.58, y: 0.44, w: 0.17, h: 0.12 },
    inlet: { x: 0.785, y: 0.45, w: 0.19, h: 0.12 },
    outlet: { x: 0.735, y: 0.505, w: 0.15, h: 0.12 },
    pack: { x: 0.56, y: 0.575, w: 0.57, h: 0.22 },
    cups: { x: 0.54, y: 0.71, w: 0.66, h: 0.14 }
  };
  const focusPoints = {};
  const $ = (id) => document.getElementById(id);
  const kitImage = $('kitImage');
  const kitStage = $('kitStage');
  let selectedId = null;
  let kitFocusedId = null;
  let cameraTween = null;
  let replaceTimeline = null;
  let assemblyTimeline = null;
  let assembled = false;
  let replaced = false;
  let pointerStart = null;

  function syncKitHotspots() {
    if (!kitImage || !kitStage || !kitImage.naturalWidth || !kitImage.naturalHeight) return;
    const stageRect = kitStage.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;
    const imageRatio = kitImage.naturalWidth / kitImage.naturalHeight;
    const renderedWidth = Math.min(stageRect.width, stageRect.height * imageRatio);
    const renderedHeight = Math.min(stageRect.height, stageRect.width / imageRatio);
    const offsetX = (stageRect.width - renderedWidth) / 2;
    const offsetY = (stageRect.height - renderedHeight) / 2;
    for (const [id, region] of Object.entries(kitHotspots)) {
      const button = document.querySelector(`#kitView .hotspot[data-part="${id}"]`);
      if (!button) continue;
      const centerX = offsetX + region.x * renderedWidth;
      const centerY = offsetY + region.y * renderedHeight;
      button.style.left = `${centerX}px`;
      button.style.top = `${centerY}px`;
      button.style.width = `${Math.max(26, region.w * renderedWidth)}px`;
      button.style.height = `${Math.max(26, region.h * renderedHeight)}px`;
      button.style.transform = 'translate(-50%, -50%)';
      focusPoints[id] = { x: centerX / stageRect.width, y: centerY / stageRect.height };
    }
  }
  if (kitImage) {
    kitImage.addEventListener('load', syncKitHotspots);
    if (kitImage.complete) syncKitHotspots();
  }

  function paintDetails(id, source = 'kit') {
    const part = parts[id];
    if (!part) return;
    selectedId = id;
    if ($('detailContent')) $('detailContent').hidden = false;
    if (source === 'kit') {
      if ($('kitWorkspace')) {
        $('kitWorkspace').classList.remove('no-selection');
        $('kitWorkspace').classList.add('has-selection');
      }
      if ($('detailsCard')) $('detailsCard').hidden = false;
    } else {
      if ($('detailsCard')) $('detailsCard').hidden = true;
      if ($('detailContent')) $('detailContent').hidden = true;
      if ($('kitWorkspace')) {
        $('kitWorkspace').classList.remove('has-selection');
        $('kitWorkspace').classList.add('no-selection');
      }
    }
    const showModelDetails = assembled && id !== 'cups' && Boolean(modelParts[id]);
    if ($('modelDetails')) $('modelDetails').hidden = !showModelDetails;
    if ($('modelDetailContent')) $('modelDetailContent').hidden = !showModelDetails;
    document.querySelector('.product-layout')?.classList.toggle('has-model-selection', showModelDetails);
  document.querySelectorAll('[data-part]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.part === id);
      button.setAttribute('aria-pressed', button.dataset.part === id ? 'true' : 'false');
    });
    document.querySelectorAll('[data-part-name]').forEach((node) => { node.textContent = part.name; });
    document.querySelectorAll('[data-part-material]').forEach((node) => { node.textContent = part.material; });
    document.querySelectorAll('[data-part-purpose]').forEach((node) => { node.textContent = part.purpose; });
    document.querySelectorAll('[data-part-index]').forEach((node) => { node.textContent = String(Object.keys(parts).indexOf(id) + 1).padStart(2, '0'); });
    if (assembled && id !== 'cups' && modelParts[id] && camera) focusModelPart(id);
  }

  function positionKitDetails(id) {
    const workspace = $('kitWorkspace');
    const stageBounds = $('kitStage');
    const card = $('detailsCard');
    const target = Array.from(document.querySelectorAll('#kitView .hotspot')).find((node) => node.dataset.part === id);
    if (!workspace || !stageBounds || !card || card.hidden || !target) return;

    const workspaceRect = workspace.getBoundingClientRect();
    const stageRect = stageBounds.getBoundingClientRect();
    const cardWidth = card.offsetWidth || 220;
    const cardHeight = card.offsetHeight || 150;
    // Focus zoom animates the artwork and hotspot toward stage center; anchor to
    // that final position so the card doesn't stay stranded at its pre-zoom spot.
    const anchorX = stageRect.left + stageRect.width / 2;
    const anchorY = stageRect.top + stageRect.height / 2;
    const mobileCard = window.matchMedia("(max-width: 600px)").matches;
    const objectClearance = mobileCard ? Math.min(stageRect.width * 0.025, 8) : Math.min(stageRect.width * 0.055, 70);
    const gap = mobileCard ? 4 : 10;
    const stageLeft = stageRect.left - workspaceRect.left + 12;
    const stageRight = stageRect.right - workspaceRect.left - cardWidth - 12;
    const rightSide = anchorX - workspaceRect.left + objectClearance + gap;
    const leftSide = anchorX - workspaceRect.left - objectClearance - gap - cardWidth;
    let left;
    let top;

    if (rightSide <= stageRight) {
      left = rightSide;
      top = anchorY - workspaceRect.top - cardHeight / 2;
    } else if (leftSide >= stageLeft) {
      left = leftSide;
      top = anchorY - workspaceRect.top - cardHeight / 2;
    } else {
      // Compact viewports cannot fit a card beside the focused part without covering it.
      left = Math.max(stageLeft, Math.min((stageRect.left - workspaceRect.left) + (stageRect.width - cardWidth) / 2, stageRight));
      top = stageRect.bottom - workspaceRect.top + 8;
    }

    const stageTop = stageRect.top - workspaceRect.top + 8;
    const stageBottom = stageRect.bottom - workspaceRect.top - cardHeight - 8;
    if (top <= stageBottom) top = Math.max(stageTop, top);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }
  function focusBoxPart(id) {
    const artwork = $('kitArtwork');
    if (!kitImage || !kitStage || !artwork) return;
    const focus = focusPoints[id] || focusPoints.chamber;
    const scale = 1.3;
    const bounds = kitStage.getBoundingClientRect();
    const tx = bounds.width * (0.5 - focus.x) * scale;
    const ty = bounds.height * (0.5 - focus.y) * scale;
    artwork.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    artwork.style.transformOrigin = 'center center';
    if ($('kitFocusHint')) $('kitFocusHint').textContent = `Focused on ${parts[id].name}`;
    requestAnimationFrame(() => positionKitDetails(id));
  }

  function clearKitFocus() {
    kitFocusedId = null;
    selectedId = null;
    if ($('kitArtwork')) $('kitArtwork').style.transform = '';
    if ($('detailsCard')) $('detailsCard').hidden = true;
    if ($('detailContent')) $('detailContent').hidden = true;
    if ($('kitWorkspace')) {
      $('kitWorkspace').classList.remove('has-selection');
      $('kitWorkspace').classList.add('no-selection');
    }
    document.querySelectorAll('#kitView [data-part]').forEach((button) => {
      button.classList.remove('is-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    if ($('kitFocusHint')) $('kitFocusHint').textContent = 'Click a component in the box to inspect it';
  }

  document.querySelectorAll('[data-part]').forEach((button) => {
    button.addEventListener('click', () => {
      const inKit = Boolean(button.closest('#kitView'));
      if (inKit && kitTourActive) endKitTour();
      if (inKit && kitFocusedId === button.dataset.part) {
        clearKitFocus();
        return;
      }
      if (inKit) kitFocusedId = button.dataset.part;
      paintDetails(button.dataset.part, inKit ? 'kit' : 'model');
      if (inKit) focusBoxPart(button.dataset.part);
    });
  });

  window.addEventListener('resize', () => {
    syncKitHotspots();
    if (kitFocusedId) focusBoxPart(kitFocusedId);
  });
  if ('ResizeObserver' in window && kitStage) {
    new ResizeObserver(() => {
      syncKitHotspots();
      if (kitFocusedId) focusBoxPart(kitFocusedId);
    }).observe(kitStage);
  }

  const kitTourParts = ['chamber', 'topcap', 'bottomcap', 'inlet', 'outlet', 'pack', 'cups'];
  let kitTourActive = false;
  let kitTourIndex = 0;
  let kitTourStarted = false;
  let kitTourTimer = 0;
  function showKitTourPart() {
    const id = kitTourParts[kitTourIndex];
    kitFocusedId = id;
    paintDetails(id);
    focusBoxPart(id);
    $('kitTourCount').textContent = `${String(kitTourIndex + 1).padStart(2, '0')} / ${String(kitTourParts.length).padStart(2, '0')}`;
    $('kitTourProgress').style.transform = `scaleX(${(kitTourIndex + 1) / kitTourParts.length})`;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      $('detailsCard').animate([{ opacity: 0.72, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 190, easing: 'cubic-bezier(0.23,1,0.32,1)' });
    }
  }
  function endKitTour() {
    window.clearTimeout(kitTourTimer);
    kitTourActive = false;
    $('kitTourControls').hidden = true;
    clearKitFocus();
  }
  function playNextKitTourPart() {
    showKitTourPart();
    if (kitTourIndex === kitTourParts.length - 1) {
      kitTourTimer = window.setTimeout(endKitTour, 2100);
      return;
    }
    kitTourTimer = window.setTimeout(() => { kitTourIndex += 1; playNextKitTourPart(); }, 2100);
  }
  function startKitTour() {
    if (kitTourStarted) return;
    kitTourStarted = true;
    kitTourActive = true;
    kitTourIndex = 0;
    $('kitTourControls').hidden = false;
    playNextKitTourPart();
  }
  document.addEventListener('eco-oil:kit-opened', startKitTour);
  $('kitTourSkip').addEventListener('click', endKitTour);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // SAME_LOOK = true: desktop, iPad and phone all render the same 3D look (shadows, pixel ratio cap, materials).
  // Set it to false to bring back the old reduced look (no shadows, lower resolution) on touch devices for speed.
  const SAME_LOOK = true;
  const touchDevice = window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 768px)').matches;
  const lowPowerMode = !SAME_LOOK && touchDevice;
  const SHADOWS = false; // iPad look: no cast shadows on any device (desktop, iPad, phone)
  // three r149 renders an extra MSAA + mipmapped transmission pass every frame when any material has transmission > 0.
  // The values used here are 1-4%, which is visually negligible, so skip it on touch devices (iPad).
  const transmissionAmount = () => 0; // same on every device: skips the per-frame transmission pass
  const MAX_RENDER_PIXELS = 1500000; // pixel budget for touch devices so fullscreen does not blow up the fill rate
  let qualityScale = 1; // lowered automatically on touch devices when the frame rate drops
  function targetPixelRatio(width, height) {
    const cap = (lowPowerMode || touchDevice) ? 1.1 : 1.6; // touch screens are 2-3x DPR: keep the GPU load of the original build
    let ratio = Math.min(window.devicePixelRatio || 1, cap);
    if (touchDevice) ratio = Math.min(ratio, Math.sqrt(MAX_RENDER_PIXELS / Math.max(1, width * height))) * qualityScale;
    return Math.max(0.5, ratio);
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#B8D8C0');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  const baseCameraPosition = new THREE.Vector3(5.1, 2.6, 11.4);
  const cameraTarget = new THREE.Vector3(0, -0.18, 0);
  camera.position.copy(baseCameraPosition);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(targetPixelRatio(stage.clientWidth || 1, stage.clientHeight || 1));
  renderer.setSize(stage.clientWidth || 1, stage.clientHeight || 1, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = SHADOWS;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  scene.add(new THREE.HemisphereLight('#f8fff9', '#526657', 1.45));
  const key = new THREE.DirectionalLight('#fff8ec', 2.2);
  key.position.set(-4, 7, 6);
  key.castShadow = SHADOWS;
  key.shadow.mapSize.set(lowPowerMode ? 512 : 1024, lowPowerMode ? 512 : 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#c9e9f0', 0.72);
  fill.position.set(5, 2, -4);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.1, 64), new THREE.MeshStandardMaterial({ color: '#B8D8C0', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.18;
  floor.receiveShadow = true;
  scene.add(floor);
  const productRoot = new THREE.Group();
  productRoot.position.y = -0.05;
  scene.add(productRoot);
  const modelParts = {};
  let installed = false;
  const installCameraPosition = new THREE.Vector3(4.9, 1.55, 12.1);
  const installCameraTarget = new THREE.Vector3(0.45, -1.2, 0);
  const installContext = new THREE.Group();
  installContext.visible = false;
  productRoot.add(installContext);
  const cabinetMat = new THREE.MeshStandardMaterial({ color: '#654321', roughness: 0.9, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
  const cabinetEdgeMat = new THREE.MeshStandardMaterial({ color: '#402a17', roughness: 0.86, transparent: true, opacity: 0.84 });
  const sinkMat = new THREE.MeshStandardMaterial({ color: '#d6dfdd', roughness: 0.36, metalness: 0.14, transparent: true, opacity: 0.96, side: THREE.DoubleSide });
  const drainMat = new THREE.MeshStandardMaterial({ color: '#858c87', roughness: 0.48, metalness: 0.06, transparent: true, opacity: 0.96 });
  function contextMesh(geometry, material, position, scale) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (scale) mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    installContext.add(mesh);
    return mesh;
  }
  // A quiet, open-front cabinet lets the installed filter and its pipework stay legible.
  contextMesh(new THREE.BoxGeometry(7.2, 0.18, 3.5), cabinetMat, [0, 3.02, -0.12]);
  contextMesh(new THREE.BoxGeometry(7.2, 0.12, 3.5), cabinetMat, [0, -3.12, -0.12]);
  contextMesh(new THREE.BoxGeometry(0.12, 6.1, 3.5), cabinetMat, [-3.54, -0.02, -0.12]);
  contextMesh(new THREE.BoxGeometry(0.12, 6.1, 3.5), cabinetMat, [3.54, -0.02, -0.12]);
  contextMesh(new THREE.BoxGeometry(7.2, 6.1, 0.1), cabinetMat, [0, -0.02, -1.82]);
  contextMesh(new THREE.BoxGeometry(7.25, 0.055, 3.56), cabinetEdgeMat, [0, 2.9, -0.12]);
  contextMesh(new THREE.BoxGeometry(7.25, 0.055, 3.56), cabinetEdgeMat, [0, -3.04, -0.12]);
  contextMesh(new THREE.SphereGeometry(1, 48, 28), sinkMat, [-1.62, 3.08, 0.24], [1.12, 0.34, 0.92]);
  // The drain stem from the sink joins the filter's raised upper PVC inlet.
  const sinkDrainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.62, 2.86, 0), new THREE.Vector3(-1.62, 2.48, 0),
    new THREE.Vector3(-1.62, 2.28, 0), new THREE.Vector3(-1.62, 1.96, 0)
  ], false, 'centripetal');
  contextMesh(new THREE.TubeGeometry(sinkDrainCurve, 28, 0.16, 16, false), drainMat, [0, 0, 0]);
  const sinkDrainCoupling = contextMesh(new THREE.CylinderGeometry(0.205, 0.205, 0.24, 32), drainMat, [-1.62, 2.48, 0]);

  const plastic = new THREE.MeshStandardMaterial({ color: '#f4f3ed', roughness: 0.32, metalness: 0.02 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#8ab7cb', roughness: 0.28, metalness: 0.02, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, transmission: transmissionAmount(0.01) });
  const pvc = new THREE.MeshPhysicalMaterial({ color: '#819aaa', roughness: 0.14, metalness: 0.06, transparent: true, opacity: 0.56, side: THREE.DoubleSide, depthWrite: false });
  const waterMat = new THREE.MeshPhysicalMaterial({ color: '#034770', roughness: 0.2, transparent: true, opacity: 0.84, transmission: transmissionAmount(0.01), side: THREE.DoubleSide, depthWrite: false });
  const oilMat = new THREE.MeshPhysicalMaterial({ color: '#e5a91d', roughness: 0.15, transparent: true, opacity: 0.94, metalness: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const clothMat = new THREE.MeshStandardMaterial({ color: '#eee8df', roughness: 0.92, transparent: true, opacity: 0.73, side: THREE.DoubleSide, depthWrite: false });
  const fibreMat = new THREE.MeshStandardMaterial({ color: '#4f3d2b', roughness: 0.96 });
  const charcoalMat = new THREE.MeshStandardMaterial({ color: '#0f0800', roughness: 0.78 });
  const cottonMat = new THREE.MeshStandardMaterial({ color: '#eee9df', roughness: 0.9 });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#c88e6b', roughness: 0.72 });

  function tagTree(root, id) {
    root.traverse((child) => { if (child.isMesh) { child.userData.partId = id; child.castShadow = true; child.receiveShadow = true; } });
  }
  function partRoot(id) {
    const group = new THREE.Group();
    group.userData.partId = id;
    productRoot.add(group);
    modelParts[id] = group;
    return group;
  }
  function addMesh(root, geometry, material, id) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.partId = id;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }
  function torusAt(root, radius, tube, y, material, id) {
    const ring = addMesh(root, new THREE.TorusGeometry(radius, tube, 10, 64), material, id);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    return ring;
  }
  function taperedTube(curve, tubularSegments, radius, radialSegments, taper = 0.14) {
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    const positions = geometry.attributes.position;
    for (let ring = 0; ring <= tubularSegments; ring++) {
      const center = curve.getPointAt(ring / tubularSegments);
      const ringScale = 1 - taper * (ring / tubularSegments);
      for (let vertex = 0; vertex <= radialSegments; vertex++) {
        const index = ring * (radialSegments + 1) + vertex;
        const point = new THREE.Vector3().fromBufferAttribute(positions, index);
        point.sub(center).multiplyScalar(ringScale).add(center);
        positions.setXYZ(index, point.x, point.y, point.z);
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  const chamber = partRoot('chamber');
  addMesh(chamber, new THREE.CylinderGeometry(0.68, 0.68, 2.82, 64, 1, true), glass, 'chamber');
  const rimMat = new THREE.MeshStandardMaterial({ color: '#4c6671', roughness: 0.23, metalness: 0.16 });
  torusAt(chamber, 0.68, 0.052, 1.39, rimMat, 'chamber');
  torusAt(chamber, 0.68, 0.052, -1.39, rimMat, 'chamber');
  for (const side of [-1, 1]) {
    const highlight = addMesh(chamber, new THREE.CylinderGeometry(0.016, 0.016, 2.68, 8), new THREE.MeshStandardMaterial({ color: '#78b8d1', roughness: 0.24, metalness: 0.04, transparent: true, opacity: 0.7 }), 'chamber');
    highlight.position.set(side * 0.56, 0, 0.36);
  }
  const water = addMesh(chamber, new THREE.CylinderGeometry(0.615, 0.615, 1.9, 64, 1, false), waterMat, 'chamber');
  water.position.y = -0.28;
  water.visible = false;
  const waterSurfaceMat = new THREE.MeshPhysicalMaterial({ color: '#034770', roughness: 0.24, metalness: 0.02, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const waterSurface = addMesh(chamber, new THREE.CircleGeometry(0.608, 64), waterSurfaceMat, 'chamber');
  waterSurface.rotation.x = -Math.PI / 2;
  waterSurface.visible = false;
  const waterRippleMat = new THREE.MeshStandardMaterial({ color: '#9ac9df', roughness: 0.28, transparent: true, opacity: 0, depthWrite: false });
  const waterRipple = torusAt(chamber, 0.16, 0.004, 0, waterRippleMat, 'chamber');
  waterRipple.position.x = 0.065;
  waterRipple.position.z = 0.08;
  waterRipple.visible = false;
  const oil = addMesh(chamber, new THREE.CylinderGeometry(0.617, 0.617, 0.105, 48, 1, false), oilMat, 'chamber');
  const OIL_START_Y = 0.73;
  const OIL_BIOCHAR_Y = -0.86;
  oil.position.y = OIL_START_Y;
  oil.visible = false;
  const oilSurfaceMat = new THREE.MeshStandardMaterial({ color: '#ffe080', roughness: 0.16, transparent: true, opacity: 0.94, side: THREE.DoubleSide });
  const oilSurface = addMesh(chamber, new THREE.CircleGeometry(0.605, 48), oilSurfaceMat, 'chamber');
  oilSurface.rotation.x = -Math.PI / 2;
  oilSurface.position.y = OIL_START_Y + 0.06;
  oilSurface.visible = false;
  const bubbleMat = new THREE.MeshStandardMaterial({ color: '#e3f7ff', roughness: 0.08, metalness: 0.06, transparent: true, opacity: 0.76 });
  const bubbles = [];
  for (let i = 0; i < 17; i++) {
    const angle = i * 2.399963;
    const radius = 0.17 + (i % 5) * 0.075;
    const bubble = addMesh(chamber, new THREE.SphereGeometry(0.018 + (i % 3) * 0.008, 10, 8), bubbleMat, 'chamber');
    bubble.position.set(Math.cos(angle) * radius, -0.94 + ((i * 11) % 17) * 0.088, Math.sin(angle) * radius);
    bubble.visible = false;
    bubbles.push(bubble);
  }

  function makeCap(id) {
    const cap = partRoot(id);
    addMesh(cap, new THREE.CylinderGeometry(0.78, 0.74, 0.27, 56, 1, false), plastic, id);
    for (let i = 0; i < 5; i++) torusAt(cap, 0.73 + i * 0.003, 0.012, -0.085 + i * 0.034, new THREE.MeshStandardMaterial({ color: '#dddcd5', roughness: 0.45 }), id);
    const gripMat = new THREE.MeshStandardMaterial({ color: '#e7e5dd', roughness: 0.42 });
    for (let i = 0; i < 28; i++) {
      const angle = i * Math.PI * 2 / 28;
      const rib = addMesh(cap, new THREE.BoxGeometry(0.025, 0.17, 0.028), gripMat, id);
      rib.position.set(Math.cos(angle) * 0.755, 0, Math.sin(angle) * 0.755);
      rib.rotation.y = -angle;
    }
    return cap;
  }
  const bottomCap = makeCap('bottomcap');
  bottomCap.position.y = -1.53;
  const topCap = makeCap('topcap');
  topCap.position.y = 1.53;

  function makePipe(id, points) {
    const pipe = partRoot(id);
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
    addMesh(pipe, new THREE.TubeGeometry(curve, 44, 0.135, 16, false), pvc, id);
    const ends = [points[0], points[points.length - 1]];
    ends.forEach((point, index) => {
      // The sink drain overlaps this inlet end, so omit the open-end collar at the joint.
      if (id === 'inlet' && index === 0) return;
      // The installed drain continues directly from this outlet end. Keep that elbow smooth
      // by hiding the exposed lip at the shared junction.
      if (id === 'outlet' && index === 1) return;
      const direction = index === 0
        ? new THREE.Vector3(...points[1]).sub(new THREE.Vector3(...points[0])).normalize()
        : new THREE.Vector3(...points[points.length - 1]).sub(new THREE.Vector3(...points[points.length - 2])).normalize();
      const lip = addMesh(pipe, new THREE.TorusGeometry(0.145, 0.018, 12, 48), new THREE.MeshStandardMaterial({ color: '#d9e7eb', roughness: 0.22, metalness: 0.12, transparent: true, opacity: 0.84 }), id);
      lip.position.set(point[0], point[1], point[2]);
      lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      const innerLip = addMesh(pipe, new THREE.TorusGeometry(0.105, 0.008, 8, 40), new THREE.MeshStandardMaterial({ color: '#526976', roughness: 0.35, transparent: true, opacity: 0.58 }), id);
      innerLip.position.set(point[0], point[1], point[2]);
      innerLip.quaternion.copy(lip.quaternion);
    });
    return { pipe, curve };
  }
  const inletPoints = [[-1.62, 2.1, 0], [-1.62, 0.84, 0], [-1.62, 0.48, 0], [-1.52, 0.38, 0], [-0.63, 0.38, 0]];
  const inletGeometry = makePipe('inlet', inletPoints);
  const inlet = inletGeometry.pipe;
  const outletPoints = [[0, -1.42, 0], [0, -1.83, 0], [0.16, -2.0, 0], [1.14, -2.0, 0]];
  const outletGeometry = makePipe('outlet', outletPoints);
  const outlet = outletGeometry.pipe;

  const flowCurve = new THREE.CatmullRomCurve3(
    inletPoints.map((point) => new THREE.Vector3(point[0], point[1], point[2] + 0.035)),
    false,
    'centripetal'
  );
  const inletFlowMat = new THREE.MeshPhysicalMaterial({ color: '#034770', roughness: 0.12, transparent: true, opacity: 0, transmission: transmissionAmount(0.04), side: THREE.DoubleSide, depthWrite: false });
  const inletFlow = addMesh(inlet, new THREE.TubeGeometry(flowCurve, 64, 0.087, 16, false), inletFlowMat, 'inlet');
  inletFlow.visible = false;
  const tankFlowPoints = [[-0.63, 0.38, 0.08], [-0.47, 0.37, 0.08], [-0.29, 0.32, 0.08], [-0.12, 0.22, 0.08], [0.015, 0.075, 0.08], [0.075, -0.055, 0.08]];
  const tankFlowCurve = new THREE.CatmullRomCurve3(tankFlowPoints.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  const tankFlowMat = new THREE.MeshPhysicalMaterial({ color: '#034770', roughness: 0.28, transparent: true, opacity: 0, transmission: 0, side: THREE.DoubleSide, depthWrite: false, emissive: '#034770', emissiveIntensity: 0.018 });
  const tankFlow = addMesh(chamber, taperedTube(tankFlowCurve, 64, 0.078, 16, 0.78), tankFlowMat, 'chamber');
  tankFlow.visible = false;
  const tankFlowSheenMat = new THREE.MeshStandardMaterial({ color: '#b6d9e8', roughness: 0.34, transparent: true, opacity: 0, depthWrite: false, emissive: '#2788b1', emissiveIntensity: 0.018 });
  const tankFlowSheen = addMesh(chamber, taperedTube(tankFlowCurve, 64, 0.006, 8, 0.62), tankFlowSheenMat, 'chamber');
  tankFlowSheen.visible = false;
  const tankFlowBeadMat = new THREE.MeshStandardMaterial({ color: '#b9eafa', roughness: 0.2, transparent: true, opacity: 0, depthWrite: false, emissive: '#55bce0', emissiveIntensity: 0.04 });
  const tankFlowBeads = [];
  for (let i = 0; i < 1; i++) {
    const bead = addMesh(chamber, new THREE.SphereGeometry(0.008, 10, 8), tankFlowBeadMat, 'chamber');
    bead.visible = false;
    tankFlowBeads.push(bead);
  }
  const mixedFlowPoints = [...inletPoints, [-0.43, 0.32, 0.045], [-0.22, 0.12, 0.045], [-0.06, -0.18, 0.045], [0.02, -0.52, 0.045], [0.02, -0.9, 0.045]];
  const mixedFlowCurve = new THREE.CatmullRomCurve3(mixedFlowPoints.map((point) => new THREE.Vector3(point[0], point[1], point[2] + 0.035)), false, 'centripetal');
  const oilFlowMat = new THREE.MeshStandardMaterial({ color: '#ffc22f', roughness: 0.14, metalness: 0.03, transparent: true, opacity: 0, depthWrite: false });
  const oilFlowDrops = [];
  for (let i = 0; i < 7; i++) {
    const drop = addMesh(inlet, new THREE.SphereGeometry(0.031 + (i % 2) * 0.009, 12, 10), oilFlowMat, 'inlet');
    drop.visible = false;
    oilFlowDrops.push(drop);
  }
  const streamOilDrops = [];
  for (let i = 0; i < 3; i++) {
    const drop = addMesh(chamber, new THREE.SphereGeometry(0.014, 12, 10), oilFlowMat, 'chamber');
    drop.scale.set(0.78, 1.25, 0.78);
    drop.visible = false;
    streamOilDrops.push(drop);
  }
  const outletFlowCurve = new THREE.CatmullRomCurve3(outletPoints.map((point) => new THREE.Vector3(point[0], point[1], point[2] + 0.035)), false, 'centripetal');
  const outletFlowMat = new THREE.MeshPhysicalMaterial({ color: '#034770', roughness: 0.1, transparent: true, opacity: 0, transmission: transmissionAmount(0.04), side: THREE.DoubleSide, depthWrite: false });
  const outletFlow = addMesh(outlet, new THREE.TubeGeometry(outletFlowCurve, 48, 0.074, 14, false), outletFlowMat, 'outlet');
  outletFlow.visible = false;
  // Start the installed drain a little inside the outlet elbow so the two PVC runs overlap
  // instead of meeting as two flat, visibly separate ends.
  const installOutletPoints = [[0.94, -2.0, 0], [1.14, -2.0, 0], [1.14, -2.18, 0], [1.14, -3.2, 0], [1.2, -3.42, 0.06], [1.38, -3.5, 0.12], [2.68, -3.5, 0.12]];
  const installOutletCurve = new THREE.CatmullRomCurve3(installOutletPoints.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  const installOutletPipe = new THREE.Mesh(new THREE.TubeGeometry(installOutletCurve, 56, 0.135, 16, false), pvc);
  installOutletPipe.castShadow = true;
  installOutletPipe.receiveShadow = true;
  installContext.add(installOutletPipe);
  const undergroundDrainCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2.45, -3.5, 0.12), new THREE.Vector3(2.95, -3.5, 0.12), new THREE.Vector3(3.58, -3.5, 0.12)
  ], false, 'centripetal');
  const undergroundDrain = new THREE.Mesh(new THREE.TubeGeometry(undergroundDrainCurve, 24, 0.205, 16, false), drainMat);
  installContext.add(undergroundDrain);
  const undergroundFlowMat = new THREE.MeshPhysicalMaterial({ color: '#034770', roughness: 0.1, transparent: true, opacity: 0, transmission: transmissionAmount(0.04), side: THREE.DoubleSide, depthWrite: false });
  // three r149 multiplies alpha by (transmissionAlpha + 0.1) (~1.1) whenever transmission > 0. We removed the (costly) transmission pass,
  // so apply the same +10% alpha directly to keep glass / water / flow exactly as opaque as the original look on every device.
  function matchTransmissionAlpha(material) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <output_fragment>', '#include <output_fragment>\n\tgl_FragColor.a = min(1.0, gl_FragColor.a * 1.1);');
    };
    material.customProgramCacheKey = () => 'alpha110';
    return material;
  }
  [glass, waterMat, inletFlowMat, outletFlowMat, undergroundFlowMat].forEach(matchTransmissionAlpha);
  const undergroundFlow = new THREE.Mesh(new THREE.TubeGeometry(installOutletCurve, 56, 0.074, 14, false), undergroundFlowMat);
  installContext.add(undergroundFlow);
  undergroundFlow.visible = false;
  const undergroundDrops = [];
  for (let i = 0; i < 3; i++) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), new THREE.MeshStandardMaterial({ color: '#034770', roughness: 0.12, transparent: true, opacity: 0, depthWrite: false }));
    drop.visible = false;
    undergroundDrops.push(drop);
    installContext.add(drop);
  }
  const outletDrops = [];
  for (let i = 0; i < 4; i++) {
    const drop = addMesh(outlet, new THREE.SphereGeometry(0.038 + (i % 2) * 0.009, 12, 10), new THREE.MeshStandardMaterial({ color: '#034770', roughness: 0.12, transparent: true, opacity: 0, depthWrite: false }), 'outlet');
    drop.visible = false;
    outletDrops.push(drop);
  }

  function makePack(id) {
    const pack = partRoot(id);
    const sackProfile = [
      new THREE.Vector2(0.1, -0.7), new THREE.Vector2(0.47, -0.69), new THREE.Vector2(0.57, -0.58),
      new THREE.Vector2(0.63, -0.32), new THREE.Vector2(0.61, -0.08), new THREE.Vector2(0.54, 0.18),
      new THREE.Vector2(0.4, 0.39), new THREE.Vector2(0.24, 0.53), new THREE.Vector2(0.14, 0.58)
    ];
    addMesh(pack, new THREE.LatheGeometry(sackProfile, 48), clothMat, id);
    const fibre = addMesh(pack, new THREE.SphereGeometry(1, 28, 20), fibreMat, id);
    fibre.scale.set(0.52, 0.38, 0.49);
    fibre.position.set(0, 0.15, 0);
    const pebbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 1), charcoalMat, 52);
    pebbles.userData.partId = id;
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < 52; i++) {
      const angle = i * 2.399963;
      const radius = 0.05 + (i % 6) * 0.08;
      const y = -0.52 + ((i * 7) % 13) * 0.018;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      dummy.position.set(x, y, z);
      const scale = 0.7 + (i % 4) * 0.12;
      dummy.scale.set(scale, scale * (0.75 + (i % 3) * 0.12), scale);
      dummy.rotation.set(i * 0.37, i * 0.71, i * 0.19);
      dummy.updateMatrix();
      pebbles.setMatrixAt(placed++, dummy.matrix);
    }
    pebbles.instanceMatrix.needsUpdate = true;
    pack.add(pebbles);
    for (let i = 0; i < 22; i++) {
      const a = i * 0.53;
      const points = [new THREE.Vector3(Math.cos(a) * 0.08, -0.22, Math.sin(a) * 0.08), new THREE.Vector3(Math.cos(a + 0.45) * 0.27, -0.04 + (i % 4) * 0.07, Math.sin(a + 0.4) * 0.22), new THREE.Vector3(Math.cos(a + 0.85) * 0.25, 0.14 + (i % 3) * 0.07, Math.sin(a + 0.7) * 0.18), new THREE.Vector3(Math.cos(a + 1.1) * 0.08, 0.34, Math.sin(a + 0.7) * 0.08)];
      addMesh(pack, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 18, 0.013, 6, false), fibreMat, id);
    }
    const tie = addMesh(pack, new THREE.TorusGeometry(0.18, 0.025, 8, 24), cottonMat, id);
    tie.position.y = 0.68;
    tie.scale.set(1, 0.45, 1);
    return pack;
  }
  const oldPack = makePack('pack');
  modelParts.pack = oldPack;
    oldPack.position.set(0, -0.68, 0.02);
    oldPack.scale.set(1.04, 1, 1.04);
  const freshPack = makePack('pack');
  freshPack.userData.fresh = true;
  freshPack.position.set(2.15, 2.2, 0.2);
  freshPack.scale.set(1.04, 1, 1.04);
  freshPack.visible = false;

  function makeCord(id) {
    const cord = new THREE.Group();
    cord.userData.partId = id;
    productRoot.add(cord);
    addMesh(cord, new THREE.CylinderGeometry(0.018, 0.018, 1, 8), cottonMat, id);
    return cord;
  }
  const oldCord = makeCord('cord');
  modelParts.cord = oldCord;
  const freshCord = makeCord('cord');
  freshCord.visible = false;
  let activePack = oldPack;
  let activeCord = oldCord;
  let sparePack = freshPack;
  let spareCord = freshCord;

  function updateCord(cord, pack, hand, handActive) {
    const start = new THREE.Vector3(pack.position.x, pack.position.y + 0.67, pack.position.z + 0.02);
    const end = handActive ? new THREE.Vector3(hand.position.x, hand.position.y - 0.18, hand.position.z) : new THREE.Vector3(start.x, 1.62, start.z);
    const direction = end.clone().sub(start);
    cord.position.copy(start).add(end).multiplyScalar(0.5);
    cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    cord.scale.y = Math.max(0.02, direction.length());
  }

  const hand = new THREE.Group();
  hand.visible = false;
  hand.userData.partId = 'cord';
  productRoot.add(hand);
  const palm = addMesh(hand, new THREE.SphereGeometry(1, 20, 16), skinMat, 'cord');
  palm.scale.set(0.2, 0.17, 0.11);
  palm.position.set(-0.02, 0.12, 0);
  const forearm = addMesh(hand, new THREE.CapsuleGeometry(0.105, 0.37, 5, 10), skinMat, 'cord');
  forearm.position.set(0.36, 0.26, 0);
  forearm.rotation.z = -1.05;
  function addFinger(x, y, length, angle = 0) {
    const finger = new THREE.Group();
    finger.position.set(x, y, 0.01);
    finger.rotation.z = angle;
    addMesh(finger, new THREE.CapsuleGeometry(0.043, length, 4, 8), skinMat, 'cord');
    finger.children[0].position.y = -length * 0.25;
    hand.add(finger);
  }
  addFinger(-0.12, -0.02, 0.18, 0.1);
  addFinger(-0.025, -0.04, 0.2, 0.03);
  addFinger(0.07, -0.02, 0.17, -0.06);
  addFinger(0.17, 0.05, 0.13, -0.35);
  const thumb = addMesh(hand, new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), skinMat, 'cord');
  thumb.position.set(-0.18, -0.01, 0.05);
  thumb.rotation.z = 0.72;

  function setExploded() {
    assembled = false;
    installed = false;
    productRoot.rotation.set(0, 0, 0);
    oil.scale.y = 1;
    oil.position.y = OIL_START_Y;
    oilSurface.position.y = OIL_START_Y + 0.06;
    water.visible = false;
    waterSurface.visible = false;
    waterRipple.visible = false;
    waterSurfaceMat.opacity = 0;
    waterRippleMat.opacity = 0;
    water.scale.y = 1;
    water.position.y = -0.28;
    waterMat.opacity = 0.84;
    oil.visible = false;
    oilSurface.visible = false;
    oilMat.opacity = 0.94;
    oilSurfaceMat.opacity = 0.94;
    inletFlow.visible = false;
    inletFlowMat.opacity = 0;
    tankFlow.visible = false;
    tankFlowMat.opacity = 0;
    tankFlowSheen.visible = false;
    tankFlowSheenMat.opacity = 0;
    tankFlowBeads.forEach((bead) => { bead.visible = false; });
    oilFlowDrops.forEach((drop) => { drop.visible = false; });
    streamOilDrops.forEach((drop) => { drop.visible = false; });
    oilFlowMat.opacity = 0;
    outletFlow.visible = false;
    outletFlowMat.opacity = 0;
    undergroundFlow.visible = false;
    undergroundFlowMat.opacity = 0;
    undergroundDrops.forEach((drop) => { drop.visible = false; drop.material.opacity = 0; });
    outletDrops.forEach((drop) => { drop.visible = false; drop.material.opacity = 0; });
    installContext.visible = false;
    floor.visible = true;
    productRoot.position.set(0, -0.05, 0);
    bubbles.forEach((bubble) => { bubble.visible = false; });
    chamber.position.set(-2.4, 0.65, -0.25);
    bottomCap.position.set(-0.75, -3.0, 0.15);
    topCap.position.set(0.88, 3.0, -0.25);
    inlet.position.set(-3.1, 0.4, 0.5);
    outlet.position.set(3.0, -1.0, 0.35);
    activePack.position.set(2.3, 1.7, 0.35);
    activePack.rotation.z = -0.25;
    activePack.visible = true;
    sparePack.rotation.set(0, 0, 0);
    activeCord.visible = false;
    sparePack.visible = false;
    spareCord.visible = false;
    hand.visible = false;
  }
  setExploded();

  const cupGroup = new THREE.Group();
  cupGroup.position.set(-2.4, -2.1, 0);
  const cupMat = new THREE.MeshStandardMaterial({ color: '#f5f1e9', roughness: 0.68, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const cup = new THREE.Group();
    const basket = addMesh(cup, new THREE.CylinderGeometry(0.18, 0.13, 0.23, 24, 1, true), cupMat, 'cups');
    basket.position.y = 0.11;
    const rim = addMesh(cup, new THREE.TorusGeometry(0.18, 0.022, 8, 24), plastic, 'cups');
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.22;
    cup.position.x = (i - 2) * 0.45;
    cupGroup.add(cup);
  }
  productRoot.add(cupGroup);
  modelParts.cups = cupGroup;
  modelParts.cups.userData.partId = 'cups';
  cupGroup.visible = false;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const worldTarget = new THREE.Vector3();
  let modelFocusedId = null;
  function focusModelPart(id) {
    const root = modelParts[id];
    if (!root || !camera) return;
    root.getWorldPosition(worldTarget);
    const direction = camera.position.clone().sub(cameraTarget).normalize();
    const distance = id === 'chamber' ? 7.25 : 5.6;
    const desired = worldTarget.clone().add(direction.multiplyScalar(distance));
    if (cameraTween) cameraTween.kill();
    cameraTween = gsap.timeline();
    cameraTween.to(camera.position, { x: desired.x, y: desired.y + (id === 'pack' || id === 'cord' ? 0.35 : 0), z: desired.z, duration: 0.75, ease: 'power3.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, 0);
    cameraTween.to(cameraTarget, { x: worldTarget.x, y: worldTarget.y, z: worldTarget.z, duration: 0.75, ease: 'power3.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, 0);
  }
  function resetModelFocus() {
    modelFocusedId = null;
    if (cameraTween) cameraTween.kill();
    const homePosition = installed ? installCameraPosition : baseCameraPosition;
    const homeTarget = installed ? installCameraTarget : new THREE.Vector3(0, -0.18, 0);
    cameraTween = gsap.timeline();
    cameraTween.to(camera.position, { x: homePosition.x, y: homePosition.y, z: homePosition.z, duration: 0.7, ease: 'power2.inOut', onUpdate: () => camera.lookAt(cameraTarget) });
    cameraTween.to(cameraTarget, { x: homeTarget.x, y: homeTarget.y, z: homeTarget.z, duration: 0.7, ease: 'power2.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, '<');
    setZoom(50);
    selectedId = null;
    if ($('modelDetailContent')) $('modelDetailContent').hidden = true;
    if ($('modelDetails')) $('modelDetails').hidden = true;
    document.querySelector('.product-layout')?.classList.remove('has-model-selection');
  }

  function updateStatus(text) { $('motionStatus').textContent = text; }
  function updateProgress(value) { $('motionProgress').style.width = `${value}%`; }
  function animateAssembly() {
    if (replaceTimeline) replaceTimeline.kill();
    if (assemblyTimeline) assemblyTimeline.kill();
    if (rotationTween) rotationTween.pause();
    setExploded();
    $('modelDetails').hidden = true;
    $('modelDetailContent').hidden = true;
    document.querySelector('.product-layout').classList.remove('has-model-selection');
    $('pageTitle').textContent = 'Your filter, assembled in 3D.';
    $('pageSubTitle').textContent = 'Drag to rotate. Select a component to focus and inspect its material.';
    camera.position.copy(baseCameraPosition);
    cameraTarget.set(0, -0.18, 0);
    camera.lookAt(cameraTarget);
    setZoom(50);
    $('replaceButton').disabled = true;
    $('replayButton').disabled = true;
    updateStatus('Ready · Parts will assemble one by one');
    updateProgress(0);
    const timeline = gsap.timeline({ onComplete() {
      assembled = true;
      $('replaceButton').disabled = false;
      $('replayButton').disabled = false;
      updateStatus(installed ? 'Running · Grease captured · Clean water draining underground' : 'Assembly complete · Ready to use');
      updateProgress(100);
      paintDetails(selectedId);
      if (installed) setAutoRotation(false);
      else if (autoRotate && rotationTween) rotationTween.resume();
    } });
    assemblyTimeline = timeline;
    const step = (text, target, vars, progress, delay = 0.15) => {
      timeline.call(() => updateStatus(text)).to(target, { ...vars, duration: 0.92, ease: 'power3.inOut' }).call(() => updateProgress(progress)).to({}, { duration: delay });
    };
    step('Placing the filter chamber', chamber.position, { x: 0, y: 0, z: 0 }, 16);
    step('Fitting the fixed bottom cap', bottomCap.position, { x: 0, y: -1.53, z: 0 }, 32);
    step('Connecting the PVC inlet and outlet', inlet.position, { x: 0, y: 0, z: 0 }, 48);
    timeline.to(outlet.position, { x: 0, y: 0, z: 0, duration: 0.92, ease: 'power3.inOut' });
    step('Lowering the material pack by its cotton string', activePack.position, { x: 0, y: -0.68, z: 0.02 }, 66);
    timeline.call(() => { activeCord.visible = true; updateCord(activeCord, activePack, hand, false); });
    step('Closing the removable top cap', topCap.position, { x: 0, y: 1.53, z: 0 }, 84);
    timeline.to(productRoot.rotation, { y: 0.12, duration: 0.75, ease: 'power2.inOut' });
    timeline.call(() => {
      updateStatus('Moving the assembled filter beneath the sink');
      $('pageTitle').textContent = 'Installed beneath the sink.';
      $('pageSubTitle').textContent = 'Water-oil mix enters above; filtered water flows from the lower PVC into the underground drain.';
      installed = true;
      setAutoRotation(false);
      installContext.visible = true;
      floor.visible = false;
      if (cameraTween) cameraTween.kill();
    });
    timeline.to(productRoot.position, { x: 0.45, y: -0.92, duration: 1.28, ease: 'power3.inOut' });
    timeline.to(camera.position, { x: installCameraPosition.x, y: installCameraPosition.y, z: installCameraPosition.z, duration: 1.28, ease: 'power3.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, '<');
    timeline.to(cameraTarget, { x: installCameraTarget.x, y: installCameraTarget.y, z: installCameraTarget.z, duration: 1.28, ease: 'power3.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, '<');
    const tankBottom = -1.23;
    const fullWaterHeight = 1.9;
    const syncWaterGeometry = () => {
      water.position.y = tankBottom + (fullWaterHeight * water.scale.y) / 2;
      const surfaceY = tankBottom + fullWaterHeight * water.scale.y;
      waterSurface.position.y = surfaceY;
      waterRipple.position.y = surfaceY + 0.012;
    };
    timeline.call(() => {
      updateStatus('Water and oil enter through the upper PVC and flow down through the tank');
      water.visible = true;
      waterSurface.visible = true;
      waterRipple.visible = true;
      waterSurfaceMat.opacity = 0;
      waterRippleMat.opacity = 0;
      water.scale.y = 0.001;
      oil.visible = false;
      oilSurface.visible = false;
      oilMat.opacity = 0.94;
      oilSurfaceMat.opacity = 0;
      bubbleMat.opacity = 0;
      bubbles.forEach((bubble) => { bubble.visible = true; });
      inletFlow.visible = true;
      tankFlow.visible = true;
      tankFlowSheen.visible = true;
      tankFlowBeads.forEach((bead) => { bead.visible = true; });
      oilFlowDrops.forEach((drop) => { drop.visible = true; });
      streamOilDrops.forEach((drop) => { drop.visible = true; });
      outletFlow.visible = false;
      outletFlowMat.opacity = 0;
      outletDrops.forEach((drop) => { drop.visible = false; });
      undergroundFlow.visible = false;
      undergroundFlowMat.opacity = 0;
      undergroundDrops.forEach((drop) => { drop.visible = false; });
      syncWaterGeometry();
    });
    timeline.to(inletFlowMat, { opacity: 0.82, duration: 1.25, ease: 'power1.inOut' });
    timeline.to(tankFlowMat, { opacity: 0.96, duration: 1.35, ease: 'power1.inOut' }, '<+=0.3');
    timeline.to(tankFlowSheenMat, { opacity: 0.13, duration: 1.35, ease: 'power1.inOut' }, '<');
    timeline.to(tankFlowBeadMat, { opacity: 0.24, duration: 0.8, ease: 'power1.out' }, '<+=0.2');
    timeline.to(waterSurfaceMat, { opacity: 0.42, duration: 1.2, ease: 'power1.out' }, '<');
    timeline.to(waterRippleMat, { opacity: 0.16, duration: 1.2, ease: 'power1.out' }, '<');
    timeline.to(oilFlowMat, { opacity: 0.94, duration: 1.5, ease: 'power1.inOut' }, '<');
    timeline.to(water.scale, { y: 0.62, duration: 7.2, ease: 'none', onUpdate: () => { syncWaterGeometry(); updateProgress(84 + Math.round(water.scale.y * 8)); } }, '<');
    timeline.to(bubbleMat, { opacity: 0.28, duration: 3.4, ease: 'power1.out' }, '<+=1.2');
    timeline.call(() => {
      updateStatus('Grease droplets are gradually captured by the material pack');
      outletFlow.visible = true;
      outletDrops.forEach((drop) => { drop.visible = true; });
      undergroundFlow.visible = true;
      undergroundDrops.forEach((drop) => { drop.visible = true; });
    }, null, '<+=2.0');
    timeline.to(outletFlowMat, { opacity: 0.92, duration: 0.8, ease: 'power1.out' }, '<');
    timeline.to(outletDrops.map((drop) => drop.material), { opacity: 0.96, duration: 0.65, ease: 'power1.out' }, '<');
    timeline.to(undergroundFlowMat, { opacity: 0.84, duration: 0.8, ease: 'power1.out' }, '<');
    timeline.to(undergroundDrops.map((drop) => drop.material), { opacity: 0.96, duration: 0.65, ease: 'power1.out' }, '<');
    timeline.to({}, { duration: 4.4 });
    timeline.call(() => updateStatus('Filtered water continues down the lower PVC while the tank level slowly falls'));
    timeline.to(water.scale, { y: 0.28, duration: 7.2, ease: 'none', onUpdate: () => { syncWaterGeometry(); updateProgress(92 + Math.round((1 - water.scale.y) * 8)); } });
    // Let the level visibly begin to fall before stopping incoming mixed water.
    // Keep the lower outlet and underground drain active throughout.
    timeline.to([inletFlowMat, tankFlowMat, tankFlowSheenMat, tankFlowBeadMat, oilFlowMat], { opacity: 0, duration: 0.72, ease: 'power1.in' }, '<+=1.2');
    timeline.call(() => {
      inletFlow.visible = false;
      tankFlow.visible = false;
      tankFlowSheen.visible = false;
      tankFlowBeads.forEach((bead) => { bead.visible = false; });
      oilFlowDrops.forEach((drop) => { drop.visible = false; });
    streamOilDrops.forEach((drop) => { drop.visible = false; });
    }, null, '<+=0.73');
    timeline.call(() => updateStatus('Running · Grease captured in the pack · Water draining underground'));
  }

  function animateReplacement() {
    if (!assembled || replaceTimeline && replaceTimeline.isActive()) return;
    if (rotationTween) rotationTween.pause();
    // Replacement is a maintenance state: stop incoming mixed flow before opening the tank.
    inletFlow.visible = false;
    inletFlowMat.opacity = 0;
    tankFlow.visible = false;
    tankFlowMat.opacity = 0;
    tankFlowSheen.visible = false;
    tankFlowSheenMat.opacity = 0;
    tankFlowBeads.forEach((bead) => { bead.visible = false; });
    oilFlowMat.opacity = 0;
    oilFlowDrops.forEach((drop) => { drop.visible = false; });
    streamOilDrops.forEach((drop) => { drop.visible = false; });
    outletFlow.visible = false;
    outletFlowMat.opacity = 0;
    undergroundFlow.visible = false;
    undergroundFlowMat.opacity = 0;
    undergroundDrops.forEach((drop) => { drop.visible = false; drop.material.opacity = 0; });
    outletDrops.forEach((drop) => { drop.visible = false; drop.material.opacity = 0; });
    const usedPack = activePack;
    const usedCord = activeCord;
    const newPack = sparePack;
    const newCord = spareCord;
    replaced = false;
    $('replaceButton').disabled = true;
    $('replayButton').disabled = true;
    const timeline = gsap.timeline({ onComplete() {
      replaced = true;
      $('replaceButton').disabled = false;
      $('replayButton').disabled = false;
      updateStatus('Fresh material pack installed · Tank empty');
      updateProgress(100);
    } });
    replaceTimeline = timeline;
    updateStatus('Opening the cap · Two weeks later');
    updateProgress(0);
    timeline.to(topCap.position, { y: 2.18, duration: 0.78, ease: 'power2.out' });
    timeline.to(waterMat, { opacity: 0, duration: 0.38, ease: 'power2.out' }, '<');
    timeline.to(oilMat, { opacity: 0, duration: 0.38, ease: 'power2.out' }, '<');
    timeline.to(oilSurfaceMat, { opacity: 0, duration: 0.38, ease: 'power2.out' }, '<');
    timeline.to({}, { duration: 0.02 }).call(() => {
      water.visible = false;
      waterSurface.visible = false;
      waterRipple.visible = false;
      waterSurfaceMat.opacity = 0;
      waterRippleMat.opacity = 0;
      oil.visible = false;
      oilSurface.visible = false;
      bubbles.forEach((bubble) => { bubble.visible = false; });
      updateStatus('Tank drained · Removing the used material pack');
    });
    timeline.call(() => { hand.visible = true; hand.position.set(0.2, 1.37, 0.38); updateCord(usedCord, usedPack, hand, true); updateStatus('Pulling the cotton string to lift the used pack'); });
    timeline.to(usedPack.position, { y: 1.52, duration: 1.42, ease: 'power2.inOut', onUpdate: () => updateCord(usedCord, usedPack, hand, true) }, '<');
    timeline.to(hand.position, { y: 2.42, duration: 1.42, ease: 'power2.inOut', onUpdate: () => updateCord(usedCord, usedPack, hand, true) }, '<');
    timeline.call(() => { usedPack.visible = false; usedCord.visible = false; updateStatus('Lowering the water level to make room for the fresh pack'); updateProgress(42); });
    timeline.to(water.scale, { y: 0.5, duration: 1.05, ease: 'power2.inOut' });
    timeline.to(water.position, { y: -0.755, duration: 1.05, ease: 'power2.inOut' }, '<');
    timeline.to(oil.position, { y: -0.22, duration: 1.05, ease: 'power2.inOut' }, '<');
    timeline.to(oilSurface.position, { y: -0.16, duration: 1.05, ease: 'power2.inOut' }, '<');
    timeline.call(() => {
      bubbles.forEach((bubble) => { bubble.visible = false; });
      updateStatus('Tank empty · Ready for the fresh material pack');
    });
    timeline.to({}, { duration: 0.9 });
    timeline.call(() => {
      newPack.visible = true;
      newPack.position.set(0.58, 1.72, 0.12);
      hand.position.set(0.2, 2.8, 0.38);
      newCord.visible = true;
      updateCord(newCord, newPack, hand, true);
      updateStatus('Holding the fresh material pack by its cotton string');
    });
    timeline.to(newPack.position, { x: 0, y: -0.68, z: 0.02, duration: 1.72, ease: 'power2.inOut', onUpdate: () => updateCord(newCord, newPack, hand, true) });
    timeline.to(hand.position, { x: 0.2, y: 1.42, duration: 1.72, ease: 'power2.inOut', onUpdate: () => updateCord(newCord, newPack, hand, true) }, '<');
    timeline.call(() => { hand.visible = false; newCord.visible = true; updateCord(newCord, newPack, hand, false); updateStatus('Closing the cap'); updateProgress(78); });
    timeline.to(topCap.position, { y: 1.53, duration: 0.68, ease: 'back.out(1.5)' });
    timeline.to(productRoot.rotation, { y: 0.12, duration: 0.55, ease: 'power2.inOut' }).call(() => {
      usedPack.visible = false;
      usedCord.visible = false;
      activePack = newPack;
      activeCord = newCord;
      sparePack = usedPack;
      spareCord = usedCord;
      modelParts.pack = activePack;
      modelParts.cord = activeCord;
      updateStatus('Fresh material pack installed · Day 0');
      updateProgress(100);
      if (autoRotate && rotationTween) rotationTween.resume();
    });
  }

  $('replayButton').addEventListener('click', () => { assembled = false; replaced = false; animateAssembly(); });
  document.addEventListener('eco-oil:reset-animation', () => {
    assembled = false;
    replaced = false;
    animateAssembly();
  });
  $('replaceButton').addEventListener('click', animateReplacement);
  $('backButton').addEventListener('click', (event) => {
    event.preventDefault();
    $('kitView').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  });  let autoRotate = !reducedMotion;
  let rotationTween = null;
  function setAutoRotation(active) {
    autoRotate = active;
    if (rotationTween) rotationTween.kill();
    rotationTween = null;
    $('rotateButton').setAttribute('aria-pressed', String(active));
    $('rotateButton').classList.toggle('is-active', active);
    $('rotateButton').textContent = active ? '⟳ Auto rotate: On' : '⟳ Auto rotate: Off';
    if (active && !reducedMotion) rotationTween = gsap.to(productRoot.rotation, { y: productRoot.rotation.y + Math.PI * 2, duration: 18, ease: 'none', repeat: -1 });
  }
  $('rotateButton').addEventListener('click', () => setAutoRotation(!autoRotate));
  const zoomSlider = $('zoomLevel');
  const zoomValue = $('zoomValue');
  function setZoom(value) {
    const percent = Math.max(30, Math.min(100, Number(value)));
    camera.zoom = percent / 50;
    camera.updateProjectionMatrix();
    if (zoomSlider) zoomSlider.value = String(percent);
    if (zoomValue) zoomValue.textContent = `${percent}%`;
  }
  $('zoomOutButton').addEventListener('click', () => setZoom(Number(zoomSlider.value) - 5));
  $('zoomInButton').addEventListener('click', () => setZoom(Number(zoomSlider.value) + 5));
  zoomSlider.addEventListener('input', () => setZoom(zoomSlider.value));

  document.querySelectorAll('[data-part]').forEach((button) => {
    if (button.dataset.part === 'cups') return;
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); paintDetails(button.dataset.part); }
    });
  });
  canvas.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY, rotationY: productRoot.rotation.y, rotationX: productRoot.rotation.x, dragged: false };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) pointerStart.dragged = true;
    if (pointerStart.dragged) {
      if (rotationTween) rotationTween.pause();
      productRoot.rotation.y = pointerStart.rotationY + dx * 0.008;
      productRoot.rotation.x = Math.max(-0.35, Math.min(0.35, pointerStart.rotationX + dy * 0.006));
    }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    if (!pointerStart.dragged) {
      const rect = canvas.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(Object.values(modelParts), true);
      const selected = hits.map((hit) => {
        let node = hit.object;
        while (node && !node.userData.partId) node = node.parent;
        return node && node.userData.partId;
      }).find(Boolean);
      if (selected) {
        if (selected === modelFocusedId) resetModelFocus();
        else { modelFocusedId = selected; paintDetails(selected); }
      }
    }
    pointerStart = null;
    if (autoRotate && rotationTween) rotationTween.resume();
  });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; if (autoRotate && rotationTween) rotationTween.resume(); });

  let lastW = 0, lastH = 0, lastRatio = 0, resizeQueued = false;
  function applyResize() {
    resizeQueued = false;
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const ratio = targetPixelRatio(width, height);
    // fullscreenchange + ResizeObserver + window resize can all fire together; skip no-op resizes (each one reallocates the GL buffers)
    if (width === lastW && height === lastH && ratio === lastRatio) return;
    lastW = width; lastH = height; lastRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  function resizeRenderer() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(applyResize);
  }
  const resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(stage);
  window.addEventListener('resize', resizeRenderer);
  let renderFrame = 0;
  let productInView = false;
  let initialAssemblyStarted = false;
  let lastRenderTime = 0;
  const frameInterval = touchDevice ? 1000 / 60 - 1.5 : 0; // tolerance so vsync jitter does not skip frames
  let frameTimeSum = 0, frameTimeCount = 0, goodWindows = 0;
  // ---- On-screen diagnostics (hidden by default; add ?debug to the URL to show) ----
  let adaptDisabled = false, frameTimeMax = 0, rafPerSec = 0, lastStats = null, transparentHidden = false;
  const fpsBadge = /[?&]debug\b/.test(location.search) ? document.createElement('div') : null;
  if (fpsBadge) {
    fpsBadge.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:56px;z-index:50;padding:6px 8px;border-radius:8px;background:#000c;color:#fff;font:11px/1.35 monospace;pointer-events:none;text-align:center;max-width:92%';
    fpsBadge.innerHTML = '<div class="dbg-text">measuring…</div><div class="dbg-btns" style="margin-top:5px;display:flex;gap:5px;justify-content:center;flex-wrap:wrap"></div>';
    const btns = fpsBadge.querySelector('.dbg-btns');
    const addBtn = (label, handler) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.style.cssText = 'pointer-events:auto;font:600 11px monospace;padding:6px 9px;border-radius:6px;border:1px solid #fff8;background:#fff2;color:#fff';
      b.addEventListener('click', (e) => { e.stopPropagation(); handler(); });
      btns.appendChild(b);
    };
    [['Res 100%', 1], ['Res 70%', 0.7], ['Res 50%', 0.5], ['Auto', 0]].forEach(([label, value]) => addBtn(label, () => {
      adaptDisabled = value > 0; qualityScale = value > 0 ? value : 1; goodWindows = 0; lastRenderTime = 0; frameTimeSum = 0; frameTimeCount = 0; frameTimeMax = 0; resizeRenderer();
    }));
    addBtn('Transparent on/off', () => {
      transparentHidden = !transparentHidden;
      scene.traverse((o) => { if (o.isMesh && o.material) [].concat(o.material).forEach((m) => { if (m.transparent) m.visible = !transparentHidden; }); });
      frameTimeSum = 0; frameTimeCount = 0; frameTimeMax = 0;
    });
    stage.appendChild(fpsBadge);
    // raw requestAnimationFrame rate, independent of the WebGL render loop (shows if the page itself is being throttled)
    let rafCount = 0, rafStart = performance.now();
    (function rafProbe(t) {
      rafCount++;
      if (t - rafStart >= 1000) { rafPerSec = Math.round(rafCount * 1000 / (t - rafStart)); rafCount = 0; rafStart = t; updateBadge(); }
      requestAnimationFrame(rafProbe);
    })(performance.now());
  }
  function updateBadge() {
    if (!fpsBadge) return;
    const info = renderer.info.render;
    const avg = lastStats ? lastStats.avg : 0;
    fpsBadge.querySelector('.dbg-text').textContent =
      `${stageIsFullscreen() ? 'FS · ' : ''}render ${avg ? (1000 / avg).toFixed(0) : '–'} fps (avg ${avg.toFixed(0)}ms, max ${frameTimeMax.toFixed(0)}ms) · rAF ${rafPerSec}/s\n` +
      `ratio ${renderer.getPixelRatio().toFixed(2)} · ${renderer.domElement.width}x${renderer.domElement.height} · calls ${info.calls} · tris ${(info.triangles / 1000).toFixed(0)}k · q ${qualityScale.toFixed(2)}${adaptDisabled ? ' (manual)' : ''}${transparentHidden ? ' · transparent OFF' : ''}`;
    fpsBadge.querySelector('.dbg-text').style.whiteSpace = 'pre-line';
  }
  function adaptQuality(avgMs) {
    lastStats = { avg: avgMs };
    updateBadge();
    frameTimeMax = 0;
    if (!touchDevice || adaptDisabled) return;
    if (avgMs > 25 && qualityScale > 0.55) {
      qualityScale = Math.max(0.55, qualityScale * (avgMs > 45 ? 0.7 : 0.85));
      goodWindows = 0;
      resizeRenderer();
    } else if (avgMs < 18.5 && qualityScale < 1) {
      if (++goodWindows >= 8) { qualityScale = Math.min(1, qualityScale * 1.1); goodWindows = 0; resizeRenderer(); }
    } else {
      goodWindows = 0;
    }
  }
  const flowClock = new THREE.Clock();
  function render(now = 0) {
    renderFrame = 0;
    if (!(productInView || stageIsFullscreen()) || document.visibilityState === 'hidden') return;
    if (frameInterval && now - lastRenderTime < frameInterval) {
      renderFrame = requestAnimationFrame(render);
      return;
    }
    const frameDelta = now - lastRenderTime;
    if (lastRenderTime && frameDelta < 250) {
      frameTimeSum += frameDelta;
      if (frameDelta > frameTimeMax) frameTimeMax = frameDelta;
      if (++frameTimeCount >= 20) { adaptQuality(frameTimeSum / frameTimeCount); frameTimeSum = 0; frameTimeCount = 0; }
    }
    lastRenderTime = now;
    if (hand.visible) {
      if (activePack.visible) updateCord(activeCord, activePack, hand, true);
      else if (sparePack.visible) updateCord(spareCord, sparePack, hand, true);
    }
    const flowTime = flowClock.getElapsedTime();
    if (inletFlow.visible) {
      oilFlowDrops.forEach((drop, index) => {
        const progress = (flowTime * 0.18 + index / oilFlowDrops.length) % 1;
        drop.position.copy(mixedFlowCurve.getPointAt(progress));
      });
    }
    if (tankFlow.visible) {
      tankFlowBeads.forEach((bead, index) => {
        const progress = (flowTime * 0.14 + index / tankFlowBeads.length) % 1;
        bead.position.copy(tankFlowCurve.getPointAt(progress));
      });
      streamOilDrops.forEach((drop, index) => {
        const progress = (flowTime * 0.11 + index / streamOilDrops.length) % 1;
        drop.position.copy(tankFlowCurve.getPointAt(progress));
      });
    }
    if (waterRipple.visible) {
      const ripplePulse = 0.985 + Math.sin(flowTime * 1.35) * 0.018;
      waterRipple.scale.set(ripplePulse, 1, ripplePulse);
      waterRippleMat.opacity = 0.145 + Math.sin(flowTime * 1.35) * 0.015;
    }
    if (outletFlow.visible) {
      outletDrops.forEach((drop, index) => {
        const progress = (flowTime * 0.24 + index / outletDrops.length) % 1;
        drop.position.copy(outletFlowCurve.getPointAt(progress));
      });
    }
    if (undergroundFlow.visible) {
      undergroundDrops.forEach((drop, index) => {
        const progress = (flowTime * 0.18 + index / undergroundDrops.length) % 1;
        drop.position.copy(installOutletCurve.getPointAt(progress));
      });
    }
    renderer.render(scene, camera);
    renderFrame = requestAnimationFrame(render);
  }
  function stageIsFullscreen() {
    return document.fullscreenElement === stage || document.webkitFullscreenElement === stage || stage.classList.contains('is-faux-fullscreen');
  }
  function startRender() { if (!renderFrame && (productInView || stageIsFullscreen()) && document.visibilityState !== 'hidden') render(); }
  function onStageFullscreenChange() {
    qualityScale = Math.min(qualityScale, 1);
    frameTimeSum = 0; frameTimeCount = 0; lastRenderTime = 0;
    resizeRenderer();
    startRender();
  }
  document.addEventListener('fullscreenchange', onStageFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onStageFullscreenChange);
  const productVisibilityObserver = new IntersectionObserver(([entry]) => {
    productInView = entry.isIntersecting;
    if (productInView) {
      resizeRenderer();
      if (!initialAssemblyStarted) {
        initialAssemblyStarted = true;
        animateAssembly();
      }
      startRender();
    }
  }, { threshold: 0.18 });
  productVisibilityObserver.observe($('productView'));
  document.addEventListener('visibilitychange', startRender);
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (fallback) fallback.hidden = false; });
  resizeRenderer();
  setAutoRotation(autoRotate);
  startRender();
})();