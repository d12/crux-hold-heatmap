class HeatmapVisualizer {
  constructor() {
    this.canvas = document.getElementById('wallCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.holds = [];
    this.image = null;
    this.hoveredHold = null;
    this.selectedHold = null;
    this.apiKey = localStorage.getItem('cruxApiKey');
    this.holdUsage = new Map(); // Maps hold IDs to array of climb IDs
    this.climbs = new Map(); // Maps climb IDs to climb data
    this.currentWallImage = null;
    this.retryAttempts = 2;
    this.retryDelay = 1000; // 1 second
    this.holdPositions = new Map(); // Maps hold IDs to their positions and masks
    this.imageWidth = 0;
    this.imageHeight = 0;
    this.lineWidth = 5;
    this.colorScheme = 'red-yellow-green';
    this.scaling = 'logarithmic';

    // Set the API key in the input if it exists
    if (this.apiKey) {
      document.getElementById('apiKeyInput').value = this.apiKey;
    }

    // Initialize gradient legend with default color scheme
    this.updateGradientLegend();

    this.setupEventListeners();
    this.setupMobileWarning();
  }

  setupEventListeners() {
    document.getElementById('loadGymsButton').addEventListener('click', () => this.loadGyms());
    document.getElementById('gymSelect').addEventListener('change', () => this.loadWallImages());
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseout', () => this.handleMouseOut());
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    // Line width slider
    const lineWidthSlider = document.getElementById('lineWidth');
    const lineWidthValue = document.getElementById('lineWidthValue');
    lineWidthSlider.addEventListener('input', (e) => {
      this.lineWidth = parseFloat(e.target.value);
      lineWidthValue.textContent = `${this.lineWidth}px`;
      this.drawHeatmap();
    });

    // Color scheme selector
    const colorSchemeSelect = document.getElementById('colorScheme');
    colorSchemeSelect.addEventListener('change', (e) => {
      this.colorScheme = e.target.value;
      this.updateGradientLegend();
      this.drawHeatmap();
    });

    // Scaling selector
    const scalingSelect = document.getElementById('scaling');
    scalingSelect.addEventListener('change', (e) => {
      this.scaling = e.target.value;
      this.drawHeatmap();
    });
  }

  setupMobileWarning() {
    const copyButton = document.getElementById('copyUrlButton');
    const urlInput = document.getElementById('desktopUrl');
    const dismissButton = document.getElementById('dismissWarning');

    copyButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(urlInput.value);
        copyButton.textContent = 'Copied!';
        copyButton.classList.add('copied');
        setTimeout(() => {
          copyButton.textContent = 'Copy URL';
          copyButton.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy URL:', err);
      }
    });

    dismissButton.addEventListener('click', () => {
      document.getElementById('mobileWarning').style.display = 'none';
    });
  }

  updateGradientLegend() {
    const gradientBar = document.querySelector('.gradient-bar');
    switch (this.colorScheme) {
      case 'blue-yellow':
        gradientBar.style.background = 'linear-gradient(to right, hsl(240, 100%, 50%), hsl(60, 100%, 50%))';
        break;
      case 'blue-red':
        gradientBar.style.background = 'linear-gradient(to right, hsl(240, 100%, 50%), hsl(0, 100%, 50%))';
        break;
      case 'red-yellow-green':
        // Dark red to yellow to deep green, with green covering more of the gradient
        gradientBar.style.background = 'linear-gradient(to right, hsl(0, 80%, 30%) 0%, hsl(55, 100%, 60%) 30%, hsl(120, 80%, 35%) 100%)';
        break;
    }
  }

  showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }

  hideError() {
    const errorElement = document.getElementById('errorMessage');
    errorElement.style.display = 'none';
  }

  async loadGyms() {
    try {
      this.hideError();
      this.apiKey = document.getElementById('apiKeyInput').value.trim();

      if (!this.apiKey) {
        throw new Error('Please enter an API key');
      }

      // Show loading indicator and hide button
      document.getElementById('loadGymsButton').style.display = 'none';
      document.getElementById('gymLoadingIndicator').style.display = 'flex';

      // Save the API key to localStorage
      localStorage.setItem('cruxApiKey', this.apiKey);

      const response = await fetch('https://www.cruxapp.ca/api/v1/users/me', {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch gyms. Please check your API key.');
      }

      const data = await response.json();

      if (!data.viewed_gyms || !Array.isArray(data.viewed_gyms)) {
        throw new Error('No gyms found in the response');
      }

      // Hide API key instructions and loading indicator
      document.querySelector('.api-key-instructions').style.display = 'none';
      document.getElementById('gymLoadingIndicator').style.display = 'none';

      // Populate gym select
      const gymSelect = document.getElementById('gymSelect');
      gymSelect.innerHTML = '<option value="">Select a gym...</option>';

      data.viewed_gyms.forEach(gym => {
        const option = document.createElement('option');
        option.value = gym.url_slug;
        option.textContent = gym.name;
        gymSelect.appendChild(option);
      });

      // Show gym selection
      document.getElementById('gymSelectionContainer').style.display = 'block';
      document.getElementById('wallGridContainer').style.display = 'none';
      document.getElementById('visualizationSection').style.display = 'none';
    } catch (error) {
      this.showError(error.message);
      // Show button again and hide loading indicator
      document.getElementById('loadGymsButton').style.display = 'block';
      document.getElementById('gymLoadingIndicator').style.display = 'none';
    }
  }

  async loadWallImages() {
    try {
      this.hideError();
      const gymSlug = document.getElementById('gymSelect').value;

      if (!gymSlug) {
        document.getElementById('wallGridContainer').style.display = 'none';
        return;
      }

      // Show progress container
      document.getElementById('progressContainer').style.display = 'block';
      document.getElementById('progressBar').style.width = '0%';
      document.getElementById('progressText').textContent = 'Loading climbs...';

      // Fetch all climbs with pagination
      let allClimbs = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(`https://www.cruxapp.ca/api/v1/gyms/${gymSlug}/climbs/custom?page=${page}`, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to fetch climbs');
        }

        const climbs = await response.json();

        if (climbs.length === 0) {
          hasMore = false;
        } else {
          allClimbs = allClimbs.concat(climbs);
          document.getElementById('progressText').textContent = `Loading climbs... (${allClimbs.length} loaded)`;
          page++;
        }
      }

      // Group climbs by wall image
      const wallGroups = new Map();
      for (const climb of allClimbs) {
        if (!climb.unedited_image_url) continue;

        if (!wallGroups.has(climb.unedited_image_url)) {
          wallGroups.set(climb.unedited_image_url, {
            climbs: [],
            earliestDate: new Date(climb.created_at),
            latestDate: new Date(climb.created_at)
          });
        }

        const group = wallGroups.get(climb.unedited_image_url);
        group.climbs.push(climb);

        const climbDate = new Date(climb.created_at);
        if (climbDate < group.earliestDate) group.earliestDate = climbDate;
        if (climbDate > group.latestDate) group.latestDate = climbDate;
      }

      // Filter out walls with only one climb and sort by latest date
      const validWalls = Array.from(wallGroups.entries())
        .filter(([_, group]) => group.climbs.length > 1)
        .sort(([_, groupA], [__, groupB]) => groupB.latestDate - groupA.latestDate);

      if (validWalls.length === 0) {
        throw new Error('No walls found with multiple climbs');
      }

      // Create wall grid
      const wallGrid = document.getElementById('wallGrid');
      wallGrid.innerHTML = '';

      validWalls.forEach(([imageUrl, group]) => {
        const card = document.createElement('div');
        card.className = 'wall-card';
        card.innerHTML = `
                    <img src="${imageUrl}" alt="Wall preview">
                    <div class="wall-card-info">
                        <p>${group.climbs.length} climbs</p>
                        <p>From: ${group.earliestDate.toLocaleDateString()}</p>
                        <p>To: ${group.latestDate.toLocaleDateString()}</p>
                    </div>
                `;

        card.addEventListener('click', () => this.loadWallData(imageUrl, group.climbs));
        wallGrid.appendChild(card);
      });

      // Show wall grid
      document.getElementById('wallGridContainer').style.display = 'block';
      document.getElementById('progressContainer').style.display = 'none';
    } catch (error) {
      this.showError(error.message);
      document.getElementById('progressContainer').style.display = 'none';
    }
  }

  async loadWallData(imageUrl, climbs) {
    try {
      this.hideError();
      this.currentWallImage = imageUrl;
      this.holdUsage.clear();
      this.climbs.clear();
      this.holdPositions.clear();

      // Hide wall grid and show progress container
      document.getElementById('wallGridContainer').style.display = 'none';
      document.getElementById('progressContainer').style.display = 'block';
      document.getElementById('progressBar').style.width = '0%';
      document.getElementById('progressText').textContent = 'Loading climb details...';

      // Load the wall image
      this.image = await this.loadImage(imageUrl);
      this.canvas.width = this.image.width;
      this.canvas.height = this.image.height;

      // Store the image dimensions
      this.imageWidth = this.image.width;
      this.imageHeight = this.image.height;

      // Fetch climbs in parallel batches
      const BATCH_SIZE = 5; // Number of concurrent requests
      let completed = 0;
      const total = climbs.length;

      // Process climbs in batches
      for (let i = 0; i < climbs.length; i += BATCH_SIZE) {
        const batch = climbs.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(climb => this.fetchClimbWithRetry(climb.id)));

        completed += batch.length;
        const progress = (completed / total) * 100;
        document.getElementById('progressBar').style.width = `${progress}%`;
        document.getElementById('progressText').textContent =
          `Loading climb details... (${completed}/${total})`;
      }

      // Merge similar holds
      this.mergeSimilarHolds();

      // Update UI
      document.getElementById('progressContainer').style.display = 'none';
      document.getElementById('visualizationSection').style.display = 'flex';

      // Hide initial UI elements
      document.getElementById('apiKeyContainer').style.display = 'none';
      document.getElementById('gymSelectionContainer').style.display = 'none';
      document.querySelector('.input-section').style.display = 'none';

      // Draw the heatmap
      this.drawHeatmap();
    } catch (error) {
      this.showError(error.message);
      document.getElementById('progressContainer').style.display = 'none';
    }
  }

  async fetchClimbWithRetry(climbId, attempt = 0) {
    try {
      const response = await fetch(`https://www.cruxapp.ca/api/v1/climbs/${climbId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (response.status === 429) { // Rate limit
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * 2));
        return this.fetchClimbWithRetry(climbId, attempt);
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch climb ${climbId}`);
      }

      const climb = await response.json();
      this.climbs.set(climbId, climb);

      // Update hold usage and store hold positions
      if (climb.holds) {
        climb.holds.forEach(hold => {
          if (!this.holdUsage.has(hold.id)) {
            this.holdUsage.set(hold.id, []);
            // Store the hold's position and mask with scaled coordinates
            this.holdPositions.set(hold.id, {
              mask: hold.mask.map(([x, y]) => [
                (x / climb.image_width) * this.canvas.width,
                (y / climb.image_height) * this.canvas.height
              ])
            });
          }
          this.holdUsage.get(hold.id).push(climbId);
        });
      }
    } catch (error) {
      if (attempt < this.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.fetchClimbWithRetry(climbId, attempt + 1);
      }
      console.warn(`Failed to fetch climb ${climbId} after ${this.retryAttempts} attempts:`, error);
    }
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.image = img;
        this.imageWidth = img.width;
        this.imageHeight = img.height;
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  drawHeatmap() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw the wall image with darkening overlay
    this.ctx.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; // Lighter overlay
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Find max usage for normalization
    const maxUsage = Math.max(...Array.from(this.holdUsage.values()).map(ids => ids.length));
    const minUsage = 1; // Minimum usage is always 1

    // Calculate scale parameters based on selected scaling method
    let scaleParams;
    if (this.scaling === 'logarithmic') {
      const logMax = Math.log(maxUsage);
      const logMin = Math.log(minUsage);
      const logRange = logMax - logMin;
      scaleParams = { logMax, logMin, logRange };
    } else {
      scaleParams = { maxUsage, minUsage, range: maxUsage - minUsage };
    }

    // Draw hold outlines with color based on usage
    this.ctx.lineWidth = this.lineWidth;

    for (const [holdId, data] of this.holdPositions) {
      const mask = data.mask;
      if (mask && mask.length > 0) {
        // Calculate usage intensity based on selected scaling method
        const usage = this.holdUsage.get(holdId).length;
        let intensity;

        if (this.scaling === 'logarithmic') {
          const logUsage = Math.log(usage);
          intensity = (logUsage - scaleParams.logMin) / scaleParams.logRange;
        } else {
          intensity = (usage - minUsage) / scaleParams.range;
        }

        // Get color based on intensity
        const color = this.getUsageColor(intensity);
        this.ctx.strokeStyle = color;

        this.ctx.beginPath();
        this.ctx.moveTo(mask[0][0], mask[0][1]);

        for (let i = 1; i < mask.length; i++) {
          this.ctx.lineTo(mask[i][0], mask[i][1]);
        }

        this.ctx.closePath();
        this.ctx.stroke();
      }
    }
  }

  getUsageColor(intensity) {
    switch (this.colorScheme) {
      case 'blue-yellow':
        const hue = 240 - intensity * 180; // 240 (blue) to 60 (yellow)
        return `hsl(${hue}, 100%, 50%)`;
      case 'blue-red':
        const hue2 = (1 - intensity) * 240; // 240 (blue) to 0 (red)
        return `hsl(${hue2}, 100%, 50%)`;
      case 'red-yellow-green': {
        // 0-0.3: dark red to yellow, 0.3-1: yellow to deep green
        let h, s, l;
        if (intensity < 0.3) {
          // Red to yellow
          const t = intensity / 0.3;
          h = 0 + (55 - 0) * t;
          s = 80 + (100 - 80) * t;
          l = 30 + (60 - 30) * t;
        } else {
          // Yellow to deep green
          const t = (intensity - 0.3) / 0.7;
          h = 55 + (120 - 55) * t;
          s = 100 + (80 - 100) * t;
          l = 60 + (35 - 60) * t;
        }
        return `hsl(${h}, ${s}%, ${l}%)`;
      }
    }
  }

  handleMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const hold = this.findHoldAtPoint(x, y);

    if (hold !== this.hoveredHold) {
      this.hoveredHold = hold;
      this.drawHeatmap();
    }

    // Update tooltip
    const tooltip = document.getElementById('tooltip');
    if (hold) {
      const climbIds = this.holdUsage.get(hold);
      const count = climbIds ? climbIds.length : 0;
      tooltip.textContent = `${count} climb${count !== 1 ? 's' : ''}\nClick for details`;
      tooltip.style.display = 'block';
      tooltip.style.left = `${e.clientX}px`;
      tooltip.style.top = `${e.clientY}px`;
    } else {
      tooltip.style.display = 'none';
    }
  }

  handleMouseOut() {
    this.hoveredHold = null;
    this.drawHeatmap();
    document.getElementById('tooltip').style.display = 'none';
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const hold = this.findHoldAtPoint(x, y);
    this.selectedHold = hold;
    this.updateHoldInfo(hold);
  }

  findHoldAtPoint(x, y) {
    let closestHold = null;
    let minDistance = Infinity;

    for (const [holdId, data] of this.holdPositions) {
      const mask = data.mask;
      if (!mask || mask.length < 3) continue;

      // Check if point is inside the hold's mask
      let inside = false;
      let j = mask.length - 1;

      for (let i = 0; i < mask.length; i++) {
        const xi = mask[i][0], yi = mask[i][1];
        const xj = mask[j][0], yj = mask[j][1];

        if ((yi > y) !== (yj > y)) {
          const intersect = (xj - xi) * (y - yi) / (yj - yi) + xi;
          if (x < intersect) {
            inside = !inside;
          }
        }
        j = i;
      }

      if (inside) {
        // Calculate center point of the hold
        const centerX = mask.reduce((sum, p) => sum + p[0], 0) / mask.length;
        const centerY = mask.reduce((sum, p) => sum + p[1], 0) / mask.length;

        // Calculate distance to center
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

        if (distance < minDistance) {
          minDistance = distance;
          closestHold = holdId;
        }
      }
    }

    return closestHold;
  }

  updateHoldInfo(holdId) {
    const holdInfo = document.getElementById('holdInfo');
    const holdInstructions = document.getElementById('holdInstructions');
    const selectedHoldImage = document.getElementById('selectedHoldImage');
    const holdDetails = document.getElementById('holdDetails');
    const climbsList = document.getElementById('climbsList');

    if (!holdId) {
      holdInstructions.style.display = 'block';
      selectedHoldImage.style.display = 'none';
      holdDetails.style.display = 'none';
      document.getElementById('holdInfoHeader').textContent = 'Hold Information';
      return;
    }

    const holdData = this.holdPositions.get(holdId);
    if (!holdData || !holdData.mask) return;

    const usageCount = this.holdUsage.get(holdId)?.length || 0;
    selectedHoldImage.querySelector('.usage-count').textContent = `${usageCount} climb${usageCount !== 1 ? 's' : ''}`;

    // Show hold image
    const bounds = this.calculateBoundingBox(holdData.mask);
    const padding = 20;

    // Create a temporary canvas to extract the hold image
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const width = bounds.maxX - bounds.minX + padding * 2;
    const height = bounds.maxY - bounds.minY + padding * 2;
    tempCanvas.width = width;
    tempCanvas.height = height;

    // Draw the hold with padding
    tempCtx.drawImage(
      this.image,
      bounds.minX - padding,
      bounds.minY - padding,
      width,
      height,
      0,
      0,
      width,
      height
    );

    selectedHoldImage.innerHTML = `
      <img src="${tempCanvas.toDataURL()}" alt="Selected hold" style="width: 100%; height: 100%; object-fit: contain;">
      <div class="usage-count">${usageCount} climb${usageCount !== 1 ? 's' : ''}</div>
    `;
    selectedHoldImage.style.display = 'grid';
    document.getElementById('holdInfoHeader').textContent = 'Selected Hold:';

    // Show climbs using this hold
    const climbIds = this.holdUsage.get(holdId) || [];
    climbsList.innerHTML = '';

    climbIds.forEach(climbId => {
      const climb = this.climbs.get(climbId);
      if (!climb) return;

      const climbItem = document.createElement('a');
      climbItem.href = `https://www.cruxapp.ca/app/gyms/${climb.gym_slug}/climbs/${climbId}`;
      climbItem.target = '_blank';
      climbItem.className = 'climb-item';
      climbItem.innerHTML = `
        <img src="${climb.image_url}" alt="Climb preview" class="climb-image">
        <div class="climb-info">
          <div class="climb-name">${climb.name || `Climb ${climbId}`}</div>
          <div class="climb-date">${new Date(climb.created_at).toLocaleDateString()}</div>
        </div>
      `;
      climbsList.appendChild(climbItem);
    });

    holdInstructions.style.display = 'none';
    holdDetails.style.display = 'block';
  }

  startOver() {
    window.location.reload();
  }

  mergeSimilarHolds() {
    const GRID_SIZE = 50; // Size of each grid cell
    const OVERLAP_THRESHOLD = 0.8; // 80% overlap required to merge holds

    // Create spatial grid
    const grid = new Map();

    // Calculate bounding boxes and add holds to grid
    for (const [holdId, data] of this.holdPositions) {
      const mask = data.mask;
      if (!mask || mask.length < 3) continue;

      // Calculate bounding box
      const bounds = this.calculateBoundingBox(mask);
      data.bounds = bounds;

      // Add to grid cells
      const startCellX = Math.floor(bounds.minX / GRID_SIZE);
      const startCellY = Math.floor(bounds.minY / GRID_SIZE);
      const endCellX = Math.floor(bounds.maxX / GRID_SIZE);
      const endCellY = Math.floor(bounds.maxY / GRID_SIZE);

      for (let x = startCellX; x <= endCellX; x++) {
        for (let y = startCellY; y <= endCellY; y++) {
          const cellKey = `${x},${y}`;
          if (!grid.has(cellKey)) {
            grid.set(cellKey, new Set());
          }
          grid.get(cellKey).add(holdId);
        }
      }
    }

    // Find and merge similar holds
    const processedHolds = new Set();
    const holdMappings = new Map(); // Maps old hold IDs to new merged hold IDs

    for (const [cellKey, holds] of grid) {
      const holdArray = Array.from(holds);

      for (let i = 0; i < holdArray.length; i++) {
        const holdId1 = holdArray[i];
        if (processedHolds.has(holdId1)) continue;

        const bounds1 = this.holdPositions.get(holdId1).bounds;
        const similarHolds = new Set([holdId1]);

        // Check other holds in the same cell
        for (let j = i + 1; j < holdArray.length; j++) {
          const holdId2 = holdArray[j];
          if (processedHolds.has(holdId2)) continue;

          const bounds2 = this.holdPositions.get(holdId2).bounds;
          const overlap = this.calculateOverlap(bounds1, bounds2);

          if (overlap >= OVERLAP_THRESHOLD) {
            similarHolds.add(holdId2);
            processedHolds.add(holdId2);
          }
        }

        if (similarHolds.size > 1) {
          // Merge holds
          const mergedHoldId = Array.from(similarHolds)[0];
          const mergedClimbs = new Set();

          for (const holdId of similarHolds) {
            const climbs = this.holdUsage.get(holdId);
            if (climbs) {
              climbs.forEach(climbId => mergedClimbs.add(climbId));
            }
            if (holdId !== mergedHoldId) {
              holdMappings.set(holdId, mergedHoldId);
            }
          }

          // Update hold usage with merged climbs
          this.holdUsage.set(mergedHoldId, Array.from(mergedClimbs));
        }

        processedHolds.add(holdId1);
      }
    }

    // Update hold positions map to remove merged holds
    for (const [oldId, newId] of holdMappings) {
      this.holdPositions.delete(oldId);
    }

    // Update top holds after merging
    this.updateTopHolds();
  }

  calculateBoundingBox(mask) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const [x, y] of mask) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    return { minX, minY, maxX, maxY };
  }

  calculateOverlap(bounds1, bounds2) {
    const intersection = {
      minX: Math.max(bounds1.minX, bounds2.minX),
      minY: Math.max(bounds1.minY, bounds2.minY),
      maxX: Math.min(bounds1.maxX, bounds2.maxX),
      maxY: Math.min(bounds1.maxY, bounds2.maxY)
    };

    if (intersection.minX >= intersection.maxX || intersection.minY >= intersection.maxY) {
      return 0;
    }

    const intersectionArea = (intersection.maxX - intersection.minX) * (intersection.maxY - intersection.minY);
    const area1 = (bounds1.maxX - bounds1.minX) * (bounds1.maxY - bounds1.minY);
    const area2 = (bounds2.maxX - bounds2.minX) * (bounds2.maxY - bounds2.minY);

    // Return the smaller of the two overlap ratios
    return Math.min(
      intersectionArea / area1,
      intersectionArea / area2
    );
  }

  updateTopHolds() {
    const topHoldsGrid = document.getElementById('topHoldsGrid');
    topHoldsGrid.innerHTML = '';

    // Sort holds by usage count
    const sortedHolds = Array.from(this.holdUsage.entries())
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 100); // Show top 100 holds

    // Create hold cards
    sortedHolds.forEach(([holdId, climbIds]) => {
      const holdData = this.holdPositions.get(holdId);
      if (!holdData || !holdData.mask) return;

      const bounds = this.calculateBoundingBox(holdData.mask);
      const padding = 20; // Add padding around the hold

      // Create a temporary canvas to extract the hold image
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      const width = bounds.maxX - bounds.minX + padding * 2;
      const height = bounds.maxY - bounds.minY + padding * 2;
      tempCanvas.width = width;
      tempCanvas.height = height;

      // Draw the hold with padding
      tempCtx.drawImage(
        this.image,
        bounds.minX - padding,
        bounds.minY - padding,
        width,
        height,
        0,
        0,
        width,
        height
      );

      // Create hold card
      const card = document.createElement('div');
      card.className = 'hold-card';
      card.innerHTML = `
        <img src="${tempCanvas.toDataURL()}" alt="Hold">
        <div class="usage-count">${climbIds.length} climbs</div>
      `;

      // Add click handler
      card.addEventListener('click', () => {
        this.selectedHold = holdId;
        this.drawHeatmap();
        this.updateHoldInfo(holdId);
      });

      topHoldsGrid.appendChild(card);
    });
  }
}

// Initialize the visualizer when the page loads
document.addEventListener('DOMContentLoaded', () => {
  // Check if device is mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  if (isMobile) {
    document.getElementById('mobileWarning').style.display = 'flex';
  }

  new HeatmapVisualizer();
});
