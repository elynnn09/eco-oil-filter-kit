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
    chamber: { name: 'Clear filter chamber', material: 'Transparent food-grade PETG', purpose: 'Houses the water, floating oil layer, and removable material pack.' },
    topcap: { name: 'Removable top cap', material: 'Food-grade polypropylene (PP)', purpose: 'Opens for access to the material pack.' },
    bottomcap: { name: 'Fixed bottom cap', material: 'Food-grade polypropylene (PP)', purpose: 'Seals the base of the filter chamber.' },
    inlet: { name: 'PVC inlet elbow', material: 'Clear rigid PVC', purpose: 'Carries water into the chamber.' },
    outlet: { name: 'PVC outlet elbow', material: 'Clear rigid PVC', purpose: 'Routes filtered water out to the drain.' },
    pack: { name: 'Material pack', material: 'Cotton filter bag with coconut fibre and biochar', purpose: 'Holds the two natural filter media layers; replace after two weeks.' },
    cord: { name: 'Cotton drawstring', material: 'Braided cotton cord', purpose: 'Pull the material pack up and lower a fresh pack into the chamber.' },
    cups: { name: 'Kitchen filter net cups', material: 'Fine nylon mesh with a polypropylene rim', purpose: 'Reusable cups shown in the kit box.' }
  };
  const focusPoints = {
    chamber: { x: 0.26, y: 0.45 }, topcap: { x: 0.43, y: 0.24 }, bottomcap: { x: 0.59, y: 0.27 },
    inlet: { x: 0.75, y: 0.27 }, outlet: { x: 0.77, y: 0.38 }, pack: { x: 0.58, y: 0.51 },
    cord: { x: 0.70, y: 0.49 }, cups: { x: 0.55, y: 0.78 }
  };
  const $ = (id) => document.getElementById(id);
  const kitImage = $('kitImage');
  const kitStage = $('kitStage');
  let selectedId = null;
  let kitFocusedId = null;
  let cameraTween = null;
  let replaceTimeline = null;
  let assemblyTimeline = null;
  let oilTween = null;
  let assembled = false;
  let replaced = false;
  let pointerStart = null;

  function paintDetails(id) {
    const part = parts[id];
    if (!part) return;
    selectedId = id;
    if ($('detailContent')) $('detailContent').hidden = false;
    if ($('kitWorkspace')) {
      $('kitWorkspace').classList.remove('no-selection');
      $('kitWorkspace').classList.add('has-selection');
    }
    if ($('detailsCard')) $('detailsCard').hidden = false;
    if ($('modelDetailContent')) $('modelDetailContent').hidden = false;
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

  function focusBoxPart(id) {
    const artwork = $('kitArtwork');
    if (!kitImage || !kitStage || !artwork) return;
    const focus = focusPoints[id] || focusPoints.chamber;
    const scale = 0.91;
    const bounds = kitStage.getBoundingClientRect();
    const tx = bounds.width * (0.5 - focus.x) * scale;
    const ty = bounds.height * (0.5 - focus.y) * scale;
    artwork.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    artwork.style.transformOrigin = 'center center';
    if ($('kitFocusHint')) $('kitFocusHint').textContent = `Focused on ${parts[id].name}`;
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
      if (inKit && kitFocusedId === button.dataset.part) {
        clearKitFocus();
        return;
      }
      if (inKit) kitFocusedId = button.dataset.part;
      paintDetails(button.dataset.part);
      if (inKit) focusBoxPart(button.dataset.part);
    });
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#A5D6A7');
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  const baseCameraPosition = new THREE.Vector3(4.6, 2.4, 8.7);
  const cameraTarget = new THREE.Vector3(0, -0.18, 0);
  camera.position.copy(baseCameraPosition);
  camera.lookAt(cameraTarget);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(stage.clientWidth || 1, stage.clientHeight || 1, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene.add(new THREE.HemisphereLight('#f8fff9', '#526657', 1.45));
  const key = new THREE.DirectionalLight('#fff8ec', 2.2);
  key.position.set(-4, 7, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#c9e9f0', 0.72);
  fill.position.set(5, 2, -4);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(3.1, 64), new THREE.MeshStandardMaterial({ color: '#A5D6A7', roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.18;
  floor.receiveShadow = true;
  scene.add(floor);
  const productRoot = new THREE.Group();
  productRoot.position.y = -0.05;
  scene.add(productRoot);
  const modelParts = {};

  const plastic = new THREE.MeshStandardMaterial({ color: '#f4f3ed', roughness: 0.32, metalness: 0.02 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#aac8d4', roughness: 0.13, metalness: 0.035, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, transmission: 0.08 });
  const pvc = new THREE.MeshPhysicalMaterial({ color: '#819aaa', roughness: 0.14, metalness: 0.06, transparent: true, opacity: 0.56, side: THREE.DoubleSide, depthWrite: false });
  const waterMat = new THREE.MeshPhysicalMaterial({ color: '#4dadd4', roughness: 0.12, transparent: true, opacity: 0.65, transmission: 0.06, side: THREE.DoubleSide, depthWrite: false });
  const oilMat = new THREE.MeshPhysicalMaterial({ color: '#e5a91d', roughness: 0.15, transparent: true, opacity: 0.94, metalness: 0.08, side: THREE.DoubleSide, depthWrite: false });
  const clothMat = new THREE.MeshStandardMaterial({ color: '#eee8df', roughness: 0.92, transparent: true, opacity: 0.73, side: THREE.DoubleSide, depthWrite: false });
  const fibreMat = new THREE.MeshStandardMaterial({ color: '#d17a3d', roughness: 0.96 });
  const charcoalMat = new THREE.MeshStandardMaterial({ color: '#36383a', roughness: 0.78 });
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

  const chamber = partRoot('chamber');
  addMesh(chamber, new THREE.CylinderGeometry(0.68, 0.68, 2.82, 64, 1, true), glass, 'chamber');
  const rimMat = new THREE.MeshStandardMaterial({ color: '#4c6671', roughness: 0.23, metalness: 0.16 });
  torusAt(chamber, 0.68, 0.052, 1.39, rimMat, 'chamber');
  torusAt(chamber, 0.68, 0.052, -1.39, rimMat, 'chamber');
  for (const side of [-1, 1]) {
    const highlight = addMesh(chamber, new THREE.CylinderGeometry(0.014, 0.014, 2.68, 8), new THREE.MeshStandardMaterial({ color: '#d8f2fb', roughness: 0.18, metalness: 0.06, transparent: true, opacity: 0.72 }), 'chamber');
    highlight.position.set(side * 0.56, 0, 0.36);
  }
  const water = addMesh(chamber, new THREE.CylinderGeometry(0.615, 0.615, 1.9, 48, 1, false), waterMat, 'chamber');
  water.position.y = -0.28;
  water.visible = false;
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
  const inletGeometry = makePipe('inlet', [[-1.62, 0.84, 0], [-1.62, 0.48, 0], [-1.52, 0.38, 0], [-0.63, 0.38, 0]]);
  const inlet = inletGeometry.pipe;
  const outlet = makePipe('outlet', [[0, -1.42, 0], [0, -1.83, 0], [0.16, -2.0, 0], [1.14, -2.0, 0]]).pipe;

  const flowCurve = new THREE.CatmullRomCurve3(
    [[-1.62, 0.84, 0.035], [-1.62, 0.48, 0.035], [-1.52, 0.38, 0.035], [-0.58, 0.38, 0.035]].map((point) => new THREE.Vector3(...point)),
    false,
    'centripetal'
  );
  const inletFlowMat = new THREE.MeshPhysicalMaterial({ color: '#35b7e8', roughness: 0.12, transparent: true, opacity: 0, transmission: 0.04, side: THREE.DoubleSide, depthWrite: false });
  const inletFlow = addMesh(inlet, new THREE.TubeGeometry(flowCurve, 64, 0.087, 16, false), inletFlowMat, 'inlet');
  inletFlow.visible = false;
  const oilFlowMat = new THREE.MeshStandardMaterial({ color: '#ffc22f', roughness: 0.14, metalness: 0.03, transparent: true, opacity: 0, depthWrite: false });
  const oilFlowDrops = [];
  for (let i = 0; i < 5; i++) {
    const drop = addMesh(inlet, new THREE.SphereGeometry(0.047 + (i % 2) * 0.008, 14, 10), oilFlowMat, 'inlet');
    drop.visible = false;
    oilFlowDrops.push(drop);
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

  function setOilHeight(value) {
    const amount = Number(value) / 100;
    const y = OIL_START_Y + (OIL_BIOCHAR_Y - OIL_START_Y) * amount;
    if (oilTween) oilTween.kill();
    oil.position.y = y;
    oilSurface.position.y = y + 0.06;
    if ($('oilPosition')) $('oilPosition').value = String(Number(value));
    if ($('oilPositionValue')) $('oilPositionValue').textContent = amount >= 0.995 ? 'At biochar' : `${Math.round(amount * 100)}% lower`;
    if (assembled && $('motionStatus')) updateStatus(amount >= 0.995 ? 'Oil layer aligned with the biochar' : 'Oil layer position adjusted');
  }

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
    productRoot.rotation.set(0, 0, 0);
    setOilHeight(0);
    water.visible = false;
    water.scale.y = 1;
    water.position.y = -0.28;
    waterMat.opacity = 0.65;
    oil.visible = false;
    oilSurface.visible = false;
    oilMat.opacity = 0.94;
    oilSurfaceMat.opacity = 0.94;
    inletFlow.visible = false;
    inletFlowMat.opacity = 0;
    oilFlowDrops.forEach((drop) => { drop.visible = false; });
    oilFlowMat.opacity = 0;
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
    cameraTween = gsap.timeline();
    cameraTween.to(camera.position, { x: baseCameraPosition.x, y: baseCameraPosition.y, z: baseCameraPosition.z, duration: 0.7, ease: 'power2.inOut', onUpdate: () => camera.lookAt(cameraTarget) });
    cameraTween.to(cameraTarget, { x: 0, y: -0.18, z: 0, duration: 0.7, ease: 'power2.inOut', onUpdate: () => camera.lookAt(cameraTarget) }, '<');
    setZoom(50);
    selectedId = null;
    if ($('modelDetailContent')) $('modelDetailContent').hidden = true;
  }

  function updateStatus(text) { $('motionStatus').textContent = text; }
  function updateProgress(value) { $('motionProgress').style.width = `${value}%`; }
  function animateAssembly() {
    if (replaceTimeline) replaceTimeline.kill();
    if (assemblyTimeline) assemblyTimeline.kill();
    if (rotationTween) rotationTween.pause();
    setExploded();
    $('replaceButton').disabled = true;
    $('replayButton').disabled = true;
    $('oilPosition').disabled = true;
    $('oilBiocharButton').disabled = true;
    updateStatus('Ready · Parts will assemble one by one');
    updateProgress(0);
    const timeline = gsap.timeline({ onComplete() {
      assembled = true;
      $('replaceButton').disabled = false;
      $('replayButton').disabled = false;
      $('oilPosition').disabled = false;
      $('oilBiocharButton').disabled = false;
      updateStatus('Assembly complete · Ready to use');
      updateProgress(100);
      paintDetails(selectedId);
      if (autoRotate && rotationTween) rotationTween.resume();
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
      updateStatus('Filling the assembled chamber with water and a thin oil layer');
      water.visible = true;
      water.scale.y = 0.001;
      water.position.y = 0.669;
      oil.visible = true;
      oilMat.opacity = 0;
      oil.position.y = OIL_START_Y;
      oilSurface.visible = true;
      oilSurfaceMat.opacity = 0;
      oilSurface.position.y = OIL_START_Y + 0.06;
      bubbles.forEach((bubble) => { bubble.visible = true; });
      inletFlow.visible = true;
      oilFlowDrops.forEach((drop) => { drop.visible = true; });
    });
    timeline.to(water.scale, { y: 1, duration: 1.45, ease: 'power1.inOut' });
    timeline.to(water.position, { y: -0.28, duration: 1.45, ease: 'power1.inOut' }, '<');
    timeline.to(inletFlowMat, { opacity: 0.82, duration: 1.2, ease: 'power1.inOut' }, '<');
    timeline.to(oilFlowMat, { opacity: 0.94, duration: 1.05, ease: 'power1.inOut' }, '<+=0.35');
    timeline.call(() => bubbles.forEach((bubble) => { bubble.visible = true; }));
    timeline.to(oilMat, { opacity: 0.94, duration: 0.7, ease: 'power1.out' }, '-=0.35');
    timeline.to(oilSurfaceMat, { opacity: 0.94, duration: 0.7, ease: 'power1.out' }, '<');
  }

  function animateReplacement() {
    if (!assembled || replaceTimeline && replaceTimeline.isActive()) return;
    if (rotationTween) rotationTween.pause();
    // Replacement is a maintenance state: stop incoming mixed flow before opening the tank.
    inletFlow.visible = false;
    inletFlowMat.opacity = 0;
    oilFlowMat.opacity = 0;
    oilFlowDrops.forEach((drop) => { drop.visible = false; });
    const usedPack = activePack;
    const usedCord = activeCord;
    const newPack = sparePack;
    const newCord = spareCord;
    replaced = false;
    $('replaceButton').disabled = true;
    $('replayButton').disabled = true;
    $('oilPosition').disabled = true;
    $('oilBiocharButton').disabled = true;
    const timeline = gsap.timeline({ onComplete() {
      replaced = true;
      $('replaceButton').disabled = false;
      $('replayButton').disabled = false;
      $('oilPosition').disabled = false;
      $('oilBiocharButton').disabled = false;
      updateStatus('Fresh material pack installed · Day 0');
      updateProgress(100);
    } });
    replaceTimeline = timeline;
    updateStatus('Opening the cap · Two weeks later');
    updateProgress(0);
    timeline.to(topCap.position, { y: 2.18, duration: 0.78, ease: 'power2.out' });
    timeline.call(() => { hand.visible = true; hand.position.set(0.2, 1.37, 0.38); updateCord(usedCord, usedPack, hand, true); updateStatus('Pulling the cotton string to lift the used pack'); });
    timeline.to(usedPack.position, { y: 1.52, duration: 1.42, ease: 'power2.inOut', onUpdate: () => updateCord(usedCord, usedPack, hand, true) }, '<');
    timeline.to(hand.position, { y: 2.42, duration: 1.42, ease: 'power2.inOut', onUpdate: () => updateCord(usedCord, usedPack, hand, true) }, '<');
    timeline.call(() => { usedPack.visible = false; usedCord.visible = false; updateStatus('Lowering the water level to make room for the fresh pack'); updateProgress(42); });
    timeline.to(water.scale, { y: 0.5, duration: 1.05, ease: 'power2.inOut' });
    timeline.to(water.position, { y: -0.755, duration: 1.05, ease: 'power2.inOut' }, '<');
    timeline.to(oil.position, { y: -0.22, duration: 1.05, ease: 'power2.inOut' }, '<');
    timeline.to(oilSurface.position, { y: -0.16, duration: 1.05, ease: 'power2.inOut' }, '<');
    timeline.call(() => {
      setOilHeight(60);
      bubbles.forEach((bubble) => { bubble.visible = bubble.position.y < -0.33; });
      updateStatus('Water level lowered to halfway · Oil stays on the surface');
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

  $('assembleButton').addEventListener('click', () => {
    $('kitView').hidden = true;
    $('productView').hidden = false;
    $('pageTitle').textContent = 'Your filter, assembled in 3D.';
    $('pageSubTitle').textContent = 'Drag to rotate. Select a component to focus and inspect its material.';
    $('productView').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    if (!assembled) animateAssembly();
    else paintDetails(selectedId);
    resizeRenderer();
  });
  $('replayButton').addEventListener('click', () => { assembled = false; replaced = false; animateAssembly(); });
  $('replaceButton').addEventListener('click', animateReplacement);
  $('oilPosition').addEventListener('input', () => setOilHeight($('oilPosition').value));
  $('oilBiocharButton').addEventListener('click', () => {
    if (oilTween) oilTween.kill();
    updateStatus('Moving the oil layer down to the biochar');
    oilTween = gsap.to(oil.position, {
      y: OIL_BIOCHAR_Y,
      duration: reducedMotion ? 0.15 : 3.2,
      ease: 'power2.inOut',
      onUpdate() {
        oilSurface.position.y = oil.position.y + 0.06;
        const amount = (OIL_START_Y - oil.position.y) / (OIL_START_Y - OIL_BIOCHAR_Y);
        $('oilPosition').value = String(Math.round(amount * 100));
        $('oilPositionValue').textContent = amount >= 0.995 ? 'At biochar' : `${Math.round(amount * 100)}% lower`;
      },
      onComplete() {
        oilSurface.position.y = OIL_BIOCHAR_Y + 0.06;
        $('oilPosition').value = '100';
        $('oilPositionValue').textContent = 'At biochar';
        updateStatus('Oil layer aligned with the biochar');
      }
    });
  });
  $('backButton').addEventListener('click', () => {
    $('productView').hidden = true;
    $('kitView').hidden = false;
    $('pageTitle').textContent = 'A clearer way to filter water.';
    $('pageSubTitle').textContent = 'Select any item in the box to focus it and see its material.';
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
  });
  let autoRotate = !reducedMotion;
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
    const percent = Math.max(30, Math.min(70, Number(value)));
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

  function resizeRenderer() {
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(stage);
  window.addEventListener('resize', resizeRenderer);
  let renderFrame = 0;
  const flowClock = new THREE.Clock();
  function render() {
    renderFrame = 0;
    if ($('productView').hidden || document.visibilityState === 'hidden') return;
    if (hand.visible) {
      if (activePack.visible) updateCord(activeCord, activePack, hand, true);
      else if (sparePack.visible) updateCord(spareCord, sparePack, hand, true);
    }
    if (inletFlow.visible) {
      const flowTime = flowClock.getElapsedTime();
      oilFlowDrops.forEach((drop, index) => {
        const progress = (flowTime * 0.18 + index / oilFlowDrops.length) % 1;
        drop.position.copy(flowCurve.getPointAt(progress));
      });
    }
    renderer.render(scene, camera);
    renderFrame = requestAnimationFrame(render);
  }
  function startRender() { if (!renderFrame && !$('productView').hidden && document.visibilityState !== 'hidden') render(); }
  const sceneObserver = new MutationObserver(startRender);
  sceneObserver.observe($('productView'), { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', startRender);
  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (fallback) fallback.hidden = false; });
  resizeRenderer();
  setAutoRotation(autoRotate);
  startRender();
})();
