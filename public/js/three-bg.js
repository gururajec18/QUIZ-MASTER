/**
 * 3D Interactive Background & Tilt Controller
 * Developed by Gururaj Surampalli
 */

(function () {
  const container = document.getElementById('three-canvas-container');
  if (!container) return;

  // Check if THREE is loaded
  if (typeof THREE !== 'undefined') {
    initThreeScene();
  } else {
    // Fallback HTML5 3D Particle Canvas
    initFallback3DCanvas();
  }

  function initThreeScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 40;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Ambient and Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x6366f1, 2, 80);
    pointLight1.position.set(20, 20, 20);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x06b6d4, 2, 80);
    pointLight2.position.set(-20, -15, 15);
    scene.add(pointLight2);

    // Floating Geometries Group
    const group = new THREE.Group();
    scene.add(group);

    // 1. Central Torus Knot
    const knotGeo = new THREE.TorusKnotGeometry(7, 1.8, 100, 16);
    const knotMat = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      metalness: 0.7,
      roughness: 0.2,
      wireframe: true,
      transparent: true,
      opacity: 0.35
    });
    const torusKnot = new THREE.Mesh(knotGeo, knotMat);
    torusKnot.position.set(25, -5, -15);
    group.add(torusKnot);

    // 2. Wireframe Icosahedron
    const icoGeo = new THREE.IcosahedronGeometry(10, 1);
    const icoMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });
    const icosahedron = new THREE.Mesh(icoGeo, icoMat);
    icosahedron.position.set(-28, 12, -20);
    group.add(icosahedron);

    // 3. Octahedron
    const octGeo = new THREE.OctahedronGeometry(6, 0);
    const octMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.4
    });
    const octahedron = new THREE.Mesh(octGeo, octMat);
    octahedron.position.set(0, -18, -10);
    group.add(octahedron);

    // 4. Starfield / Particle Cloud
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 120;
      positions[i + 1] = (Math.random() - 0.5) * 120;
      positions[i + 2] = (Math.random() - 0.5) * 80;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 1.2,
      transparent: true,
      opacity: 0.6
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse movement parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);

      // Smooth camera parallax
      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      camera.position.x = targetX * 6;
      camera.position.y = -targetY * 6;
      camera.lookAt(0, 0, 0);

      // Rotate objects
      torusKnot.rotation.x += 0.005;
      torusKnot.rotation.y += 0.008;

      icosahedron.rotation.x -= 0.004;
      icosahedron.rotation.y -= 0.006;

      octahedron.rotation.x += 0.007;
      octahedron.rotation.z += 0.005;

      particles.rotation.y += 0.0008;

      renderer.render(scene, camera);
    }

    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  // Fallback 3D Canvas if Three.js fails or runs offline
  function initFallback3DCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const nodes = [];
    for (let i = 0; i < 60; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 400 + 100,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2 + 1.5
      });
    }

    function renderFallback() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      nodes.forEach((n, idx) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0) n.x = canvas.width;
        if (n.x > canvas.width) n.x = 0;
        if (n.y < 0) n.y = canvas.height;
        if (n.y > canvas.height) n.y = 0;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.fill();

        for (let j = idx + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dist = Math.hypot(n.x - n2.x, n.y - n2.y);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = `rgba(6, 182, 212, ${0.25 * (1 - dist / 130)})`;
            ctx.stroke();
          }
        }
      });
      requestAnimationFrame(renderFallback);
    }
    renderFallback();

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });
  }

  // Global 3D Interactive Card Tilt
  document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.tilt-card');
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -10;
        const rotateY = ((x - centerX) / centerX) * 10;
        card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
      } else {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      }
    });
  });
})();
