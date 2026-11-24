window.addEventListener('DOMContentLoaded', () => {
  const configNames = [...new Set(
    window.SPAWNING.map(spawn => spawn.config)
  )];
  const configs = configNames
    .map(name => window[name])
    .filter(Boolean);
  Promise.all(configs.map(preloadImages))
    .then(() => {
      console.log("all images are loaded!");

      const creatures = [];
      window.SPAWNING.forEach(({ id, config }) => {
        const cfg = window[config];
        if (!cfg) {
          console.warn(`config not found: ${config}`);
          return;
        }
        creatures.push(new Creature(id, cfg));
      });
    })
    .catch(error => {
      console.error("error loading images:", error);
    });
});


function preloadImages(config) {
  const imagePaths = Object.values(config)
    .flatMap(item => (item.frames && Array.isArray(item.frames)) ? item.frames : []);

  return Promise.all(imagePaths.map(src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = resolve; 
    img.onerror = reject;
    img.src = src;
  })));
}

class Creature {
  constructor(containerId, spriteConfig) {
    this.currentEdge = 'bottom';

    this.container = document.createElement('div');
    this.container.className = 'webmeji-container';
    this.container.setAttribute('aria-hidden', 'true');
    this.host = document.querySelector(window.WEBMEJI_HOST || 'body') || document.body;
    this.host.appendChild(this.container);

    this.img = document.createElement('img');
    this.img.id = containerId;
    this.img.src = spriteConfig.walk.frames[0]; 
    this.container.appendChild(this.img);
    this.img.addEventListener('load', () => this.updateImageDirection());

    this.spriteConfig = spriteConfig;
    this.actionSequence = this.shuffle([...this.spriteConfig.ORIGINAL_ACTIONS]);
    this.currentActionIndex = 0;
    this.currentAction = null;
    this.frameTimer = null;         
    this.dragFrameTimer = null;    
    this.actionCompletionTimer = null;
    this.currentFrame = 0;
    this.insetCache = new Map();    
    this.direction = 1;            
    this.facing = 'left';         

    this.isDragging = false;
    this.isFalling = false;
    this.isPetting = false;
    this.isJumping = false;
    this.tripAfterFallActive = false;
    this.wasActionBeforePet = null; 

    this.isPointerDown = false;
    window.addEventListener('mousedown', () => { this.isPointerDown = true; });
    window.addEventListener('mouseup', () => { this.isPointerDown = false; });
    window.addEventListener('touchstart', () => { this.isPointerDown = true; }, { passive: true });
    window.addEventListener('touchend', () => { this.isPointerDown = false; });

    const containerStyle = window.getComputedStyle(this.container);
    this.containerWidth = parseFloat(containerStyle.width);
    this.containerHeight = parseFloat(containerStyle.height);

    this.positionX = Math.random() * (this.host.clientWidth - this.containerWidth);
    this.positionY = this.host.clientHeight - this.containerHeight;

    this.container.style.left = `${this.positionX}px`;
    this.container.style.top = `${this.positionY}px`;

    this.maxPos = this.host.clientWidth - this.containerWidth; // max horizontal position
    this.forceWalkAfter = false;
    this.forceThinkAfter = false;

    this.container.style.left = `${this.positionX}px`;
    this.container.style.top = 'auto';
    this.baseBottom = 0;

    this.updateImageDirection();

    this.currentAction = this.actionSequence[this.currentActionIndex];
    this.startAction(this.currentAction);

    this.animate = this.animate.bind(this);
    this.animationFrameId = requestAnimationFrame(this.animate);

    this.resizeHandler = () => {
      const style = window.getComputedStyle(this.container);
      this.containerWidth = parseFloat(style.width);
      this.containerHeight = parseFloat(style.height);
      this.maxPos = this.host.clientWidth - this.containerWidth;
      this.positionX = Math.min(this.positionX, this.maxPos);
      this.positionY = Math.min(this.positionY, Math.max(0, this.host.clientHeight - this.containerHeight));
      this.container.style.left = `${this.positionX}px`;
      this.container.style.top = `${this.positionY}px`;
      this.updateImageDirection();
    };
    window.addEventListener('resize', this.resizeHandler);
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => this.resizeHandler());
      this.resizeObserver.observe(this.host);
    }

    this.enablePetInteraction();
    this.enableDragInteraction();
  }

  shuffle(array) {
    for (let i=array.length-1; i>0; i--){
        const j = Math.floor(Math.random()*(i+1));
        [array[i],array[j]] = [array[j],array[i]];
    }
    return array;
  }

  updateImageDirection() {
    const insets = this.getVisualInsets();
    let translateX = 0;
    let translateY = 0;

    if (!this.isDragging && !this.isJumping) {
      if (this.currentEdge === 'left') translateX = -insets.left;
      else if (this.currentEdge === 'right') translateX = insets.right;
      else if (this.currentEdge === 'top') translateY = -insets.top;
      else if (this.currentEdge === 'bottom') translateY = insets.bottom;
    }

    const flip = this.facing === 'left' ? '' : ' scaleX(-1)';
    this.img.style.transform = `translate(${translateX}px, ${translateY}px)${flip}`;
  }

  getVisualInsets() {
    const src = this.img.currentSrc || this.img.src;
    const raw = this.getRawInsets(src);
    if (!raw || !this.img.naturalWidth || !this.img.naturalHeight) {
      return { left: 0, top: 0, right: 0, bottom: 0 };
    }

    const scaleX = this.containerWidth / this.img.naturalWidth;
    const scaleY = this.containerHeight / this.img.naturalHeight;
    const insets = {
      left: raw.left * scaleX,
      top: raw.top * scaleY,
      right: raw.right * scaleX,
      bottom: raw.bottom * scaleY
    };

    if (this.facing !== 'left') {
      const oldLeft = insets.left;
      insets.left = insets.right;
      insets.right = oldLeft;
    }
    return insets;
  }

  getRawInsets(src) {
    if (!src || !this.img.complete || !this.img.naturalWidth) return null;
    if (this.insetCache.has(src)) return this.insetCache.get(src);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = this.img.naturalWidth;
      canvas.height = this.img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(this.img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      let minX = canvas.width;
      let minY = canvas.height;
      let maxX = -1;
      let maxY = -1;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] >= 32) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      const insets = maxX < 0
        ? { left: 0, top: 0, right: 0, bottom: 0 }
        : {
            left: minX,
            top: minY,
            right: canvas.width - 1 - maxX,
            bottom: canvas.height - 1 - maxY
          };
      this.insetCache.set(src, insets);
      return insets;
    } catch (error) {
      const fallback = { left: 0, top: 0, right: 0, bottom: 0 };
      this.insetCache.set(src, fallback);
      return fallback;
    }
  }

  setFacingFromDelta(dx) {
    if (dx && !this.isDragging) {
        this.facing = dx < 0 ? 'left' : 'right';
        this.updateImageDirection();
    }
  }

  resetAnimation() {
    clearInterval(this.frameTimer);
    clearTimeout(this.actionCompletionTimer);
    this.currentFrame = 0;
    this.frameTimer = null;
    this.actionCompletionTimer = null;
  }

  clearAllTimers() {
    this.resetAnimation();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  isSideEdge(edge) { return edge === 'left' || edge === 'right'; }
  isNonBottomEdge(edge) { return edge !== 'bottom'; }

  updateEdgeClass() {
      this.container.classList.remove('edge-left','edge-right','edge-top');
      if (!this.isDragging) {
          this.currentEdge === 'left' && this.container.classList.add('edge-left');
          this.currentEdge === 'right' && this.container.classList.add('edge-right');
          this.currentEdge === 'top' && this.container.classList.add('edge-top');
      }
      this.applyEdgeOffset(); 
      this.updateImageDirection();
  }

  applyEdgeOffset() {
      if (this.isDragging) return this.container.style.cssText = `left:${this.positionX}px;top:${this.positionY}px`;

      this.container.style.left = `${this.positionX || 0}px`;
      this.container.style.top  = `${this.positionY || 0}px`;
  }

  jumpToEdge(targetEdge) {
    if (this.isFalling || this.isPetting || this.isDragging || this.isJumping) return; // ignore if busy
    if (!this.spriteConfig.ALLOWANCES.includes(targetEdge)) return; // edge not allowed

    this.isJumping = true;
    this.updateImageDirection();
    this.resetAnimation();

    const jumpConfig = this.spriteConfig.jump;
    if (!jumpConfig) { this.isJumping = false; return; }

    const startX = this.positionX;
    const startY = this.positionY;
    let endX = startX;
    let endY = startY;

    switch (targetEdge) {
        case 'top':
            endY = 0;
            endX = Math.random() * (this.host.clientWidth - this.containerWidth); // random horizontal
            break;
        case 'left':
            endX = 0;
            endY = Math.random() * (this.host.clientHeight - this.containerHeight); // random vertical
            break;
        case 'right':
            endX = this.host.clientWidth - this.containerWidth;
            endY = Math.random() * (this.host.clientHeight - this.containerHeight); // random vertical
            break;
    }

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy); // calculate distance for speed

    if (distance === 0) { this.isJumping = false; return; }

    const duration = distance / this.spriteConfig.jumpspeed; // time to reach
    const startTime = performance.now();

    // setup frame animation for jump
    let frameIndex = 0;
    const totalFrames = jumpConfig.frames.length;
    this.img.src = jumpConfig.frames[frameIndex];

    const frameTimer = setInterval(() => {
        frameIndex = (frameIndex + 1) % totalFrames;
        this.img.src = jumpConfig.frames[frameIndex];
    }, jumpConfig.interval);

    // animation loop for jump movement
    const step = (time) => {
        if (this.isDragging) {
            clearInterval(frameTimer); 
            this.isJumping = false;    
            return;                    
        }

        const elapsed = (time - startTime) / 1000;
        const t = Math.min(elapsed / duration, 1); // progress 0-1

        this.positionX = startX + dx * t;
        this.positionY = startY + dy * t;

        if (dx !== 0) this.setFacingFromDelta(dx);

        this.container.style.left = `${this.positionX}px`;
        this.container.style.top = `${this.positionY}px`;

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            clearInterval(frameTimer); 
            this.isJumping = false;
            this.currentEdge = targetEdge;
            this.updateEdgeClass();
            this.startEdgeIdle(); // start idle after landing
        }
    };
    requestAnimationFrame(step);
  }

  // start idle animation on edge
  startEdgeIdle() {
    this.updateEdgeClass();
    if (this.currentEdge === 'top') this.startAction('hangstillTop');
    else if (this.isSideEdge(this.currentEdge)) this.startAction('hangstillSide');
  }

  // pick random edge action: hang, climb, fall
  edgeAction() {
    if(this.isJumping||this.isFalling) return;
    const choice=this.spriteConfig.EDGE_ACTIONS[Math.floor(Math.random()*this.spriteConfig.EDGE_ACTIONS.length)];
    choice==='hang'?this.startEdgeIdle():
    choice==='climb'?this.startAction(this.currentEdge==='top'?'climbTop':'climbSide'):
    choice==='fall'&&this.fallToBottom();
  }

  enablePetInteraction() {
    if(!this.spriteConfig.ALLOWANCES?.includes('pet') || !this.spriteConfig.ALLOWANCES?.includes('bottom')) return;

    this.container.addEventListener('mouseenter',()=> {
        if(this.isFalling||this.isPointerDown||this.isPetting||this.isJumping||this.currentEdge!=='bottom') return;
        this.isPetting=true;
        this.wasActionBeforePet=this.currentAction;
        this.startPetAnimation();
    });
    this.container.addEventListener('mouseleave',()=> {
        if(this.isFalling||this.isPointerDown||this.isJumping||this.currentEdge==='top') return;
        this.isPetting=false;
        this.stopPetAnimation();
    });
  }

  // dragging animation and pointer tracking
  enableDragInteraction() {
    if (!this.spriteConfig.ALLOWANCES?.includes('drag')) return;
    if (!this.spriteConfig.ALLOWANCES?.includes('bottom')) return;

    let offsetX = 0;
    let offsetY = 0;

    const onPointerMove = (e) => {
        e.preventDefault();
        
        const hostRect = this.host.getBoundingClientRect();
        let clientX = e.clientX ?? e.touches?.[0].clientX;
        let clientY = e.clientY ?? e.touches?.[0].clientY;

        this.positionX = clientX - hostRect.left - offsetX;
        this.positionY = clientY - hostRect.top - offsetY;

        // clamp to the host stage
        this.positionX = Math.max(0, Math.min(this.positionX, this.host.clientWidth - this.containerWidth));
        this.positionY = Math.max(0, Math.min(this.positionY, this.host.clientHeight - this.containerHeight));

        this.container.style.left = this.positionX + 'px';
        this.container.style.top  = this.positionY + 'px';
    };

    const onPointerUp = () => {
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchend', onPointerUp);

        this.isDragging = false;
        this.isFalling = false;

        this.resetAnimation();
        this.fallToBottom();

        this.animationFrameId = requestAnimationFrame(this.animate);
    };

    // listen to pointer down to start drag
    this.container.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.startDrag(e.clientX, e.clientY);
    });

    this.container.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        this.startDrag(touch.clientX, touch.clientY);
    });

    // actual drag logic
    this.startDrag = (clientX, clientY) => {
    this.resetAnimation();

    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }

    this.isDragging = true;
    this.tripAfterFallActive = false;
    this.isJumping = false;
    this.isFalling = false;
    this.isPetting = false;

    this.currentAction = 'drag';
    this.updateImageDirection();

    if (this.dragFrameTimer) clearInterval(this.dragFrameTimer);

    const dragConfig = this.spriteConfig.drag;
    if (dragConfig?.frames?.length) {
        let frame = 0;
        this.img.src = dragConfig.frames[0];

        this.dragFrameTimer = setInterval(() => {
            frame = (frame + 1) % dragConfig.frames.length;
            this.img.src = dragConfig.frames[frame];
        }, dragConfig.interval);
    }

    const rect = this.container.getBoundingClientRect();
    let offsetX = clientX - rect.left;  // remember grab offset
    let offsetY = clientY - rect.top;

    const onPointerMove = (e) => {
        e.preventDefault();
        
        const hostRect = this.host.getBoundingClientRect();
        let clientX = e.clientX ?? e.touches?.[0].clientX;
        let clientY = e.clientY ?? e.touches?.[0].clientY;

        this.positionX = clientX - hostRect.left - offsetX;
        this.positionY = clientY - hostRect.top - offsetY;

        // clamp to the host stage
        this.positionX = Math.max(0, Math.min(this.positionX, this.host.clientWidth - this.containerWidth));
        this.positionY = Math.max(0, Math.min(this.positionY, this.host.clientHeight - this.containerHeight));

        this.container.style.left = this.positionX + 'px';
        this.container.style.top  = this.positionY + 'px';
    };

    const onPointerUp = () => {
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('mouseup', onPointerUp);
        window.removeEventListener('touchend', onPointerUp);

        this.isDragging = false;
        this.isFalling = false;

        // stop drag animation
        if (this.dragFrameTimer) {
            clearInterval(this.dragFrameTimer);
            this.dragFrameTimer = null;
        }

        this.resetAnimation();
        this.fallToBottom(); // return to bottom after drag

        this.animationFrameId = requestAnimationFrame(this.animate);
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchend', onPointerUp);
  };
  }

  // falling and recovery -------------------------------------------------
  // animate falling to bottom
  fallToBottom(fallSpeed=this.spriteConfig.fallspeed){
    if(this.isFalling) return;
    this.tripAfterFallActive = false;
    this.isFalling = true;
    this.currentEdge='bottom';
    this.updateEdgeClass();
    this.resetAnimation();

    const cfg=this.spriteConfig.falling; if(!cfg) return;

    let frameIndex=0;
    this.img.src=cfg.frames[0];
    this.frameTimer=setInterval(()=>{ 
      frameIndex=(frameIndex+1)%cfg.frames.length; 
      this.img.src=cfg.frames[frameIndex]; 
      }, cfg.interval);

    const startY=this.positionY, endY=this.host.clientHeight-this.containerHeight, distance=endY-startY;
    if(distance<=0){ clearInterval(this.frameTimer); 
      this.frameTimer=null; this.positionY=endY; 
      this.container.style.top=`${endY}px`; 
      return this.playTripAfterFall(); 
    }

    const startTime=performance.now();
    const step = (time) => {
      if (this.isDragging) {
          clearInterval(this.frameTimer);
          this.frameTimer = null;
          return this.animationFrameId = requestAnimationFrame(this.animate);
      }

      const elapsed = (time - startTime) / 1000;
      const deltaY = fallSpeed * elapsed;
      this.positionY = Math.min(startY + deltaY, endY); 
      this.container.style.top = `${this.positionY}px`;

      if (this.positionY < endY) {
          requestAnimationFrame(step);
      } else {
          clearInterval(this.frameTimer);
          this.frameTimer = null;
          this.positionY = endY;
          this.container.style.top = `${endY}px`;
          this.playTripAfterFall();
      }
    };
    requestAnimationFrame(step);
  }

  // play fallen/trip animation after landing
  playTripAfterFall() {
    const tripConfig = this.spriteConfig.fallen;
    if (!tripConfig) {
        this.resumeAfterFallen();
        return;
    }

    this.tripAfterFallActive = true;
    let frame = 0;
    const totalFrames = tripConfig.frames.length;
    this.img.src = tripConfig.frames[0];

    const frameTimer = setInterval(() => {
        frame++;

        if (frame >= totalFrames) {
            clearInterval(frameTimer);
            this.img.src = tripConfig.frames[totalFrames - 1];

            setTimeout(() => {
                if (this.tripAfterFallActive) this.resumeAfterFallen();
            }, this.spriteConfig.gettingupspeed);
        } else {
            this.img.src = tripConfig.frames[frame];
        }
    }, tripConfig.interval);
  }

  // continue normal actions after fall
  resumeAfterFallen() {
    if(this.isDragging) return;
    this.isFalling = false;
    this.isPetting = false;
    this.resetAnimation();
    this.lastTime = performance.now();
    this.currentAction = 'sit';
    this.setNextAction();
    this.animationFrameId = requestAnimationFrame(this.animate);
  }

  // action selection and animation --------------------------------------------------
  // pick next action based on edge, jump chance, or forced actions
  // If on an edge choose edge behavior -> Random chance to jump -> Forced walk / forced think -> Pick next action from shuffled list
  setNextAction() {
    if (this.isDragging || this.isFalling ) return;

    this.resetAnimation();

    if (['top', 'left', 'right'].includes(this.currentEdge)) {
        this.edgeAction();
        return;
    }

    if (!this.isJumping && this.positionY >= this.host.clientHeight - this.containerHeight) {
      if (Math.random() < this.spriteConfig.JUMP_CHANCE) { // decicion on wether to jump or not
        const edges = ['top', 'left', 'right']
          .filter(e => this.spriteConfig.ALLOWANCES.includes(e));

        if (edges.length) {
          const target = edges[Math.floor(Math.random() * edges.length)]; // random coordinate on edge
          this.jumpToEdge(target);
          return;
        }
      }
    }

    if (this.forceWalkAfter) {
      this.forceWalkAfter = false;
      this.startForcedWalk();
      return;
    }

    if (this.forceThinkAfter) {
      this.forceThinkAfter = false;
      this.startForceThink();
      return;
    }

    this.currentActionIndex++;
    if (this.currentActionIndex >= this.actionSequence.length) {
      this.currentActionIndex = 0;
      this.actionSequence = this.shuffle([...this.spriteConfig.ORIGINAL_ACTIONS]);
    }

    this.currentAction = this.actionSequence[this.currentActionIndex];
    this.startAction(this.currentAction);
  }

  // force walk for a number of cycles
  startForcedWalk() {
    const { frames, interval } = this.spriteConfig.walk;
    const walkCycles = this.spriteConfig.forcewalk;
    this.currentAction = 'forced-walk';
    this.playAnimation(frames, interval, walkCycles, () => this.setNextAction());
  }

  // force think for a number of cycles
  startForceThink() {
    const { frames, interval, loops } = this.spriteConfig.forcethink;
    this.currentAction = 'force-think';
    this.playAnimation(frames, interval, loops, () => this.setNextAction());
  }

  // pet animation loop
  startPetAnimation() {
    this.resetAnimation();

    const petConfig = this.spriteConfig.pet;
    if (!petConfig) return;

    this.currentAction = 'pet';
    let frame = 0;
    this.img.src = petConfig.frames[0];

    this.frameTimer = setInterval(() => {
      frame = (frame + 1) % petConfig.frames.length;
      this.img.src = petConfig.frames[frame];
    }, petConfig.interval);
  }

  // stop pet animation
  stopPetAnimation() {
    this.resetAnimation();
    this.currentAction = this.wasActionBeforePet || 'sit';
    this.wasActionBeforePet = null;
    this.setNextAction();
  }

  // start a given action (handles direction, frames, loops, and special cases)
  startAction(action) {  
    if (this.isDragging || this.isFalling ) return;
    this.currentAction = action;
    this.resetAnimation();

    if (action === 'climbTop') {
      this.direction = Math.random() < 0.5 ? -1 : 1;
      this.updateImageDirection();
    }
    if (action === 'climbSide') {
      this.direction = Math.random() < 0.5 ? -1 : 1;
    }
    if (this.isJumping) {
      this.animationFrameId = requestAnimationFrame(this.animate);
      return;
    }

    const config = this.spriteConfig[action];
    if (!config) return;

    const { frames, interval, loops = 1 } = config;

    if (action === 'sit' || action === 'hangstillSide' || action === 'hangstillTop') {
      const duration = config.randomizeDuration
        ? Math.random() * (config.max - config.min) + config.min
        : interval * loops;
      this.img.src = frames[0];
      this.actionCompletionTimer = setTimeout(() => {
        this.forceWalkAfter = true;
        this.setNextAction();
      }, duration);
      return;
    }

    this.playAnimation(frames, interval, loops, () => {
      if (action === 'spin') {
        this.direction *= -1;
        this.facing = this.facing === 'left' ? 'right' : 'left';
        this.updateImageDirection();
      }

      // force-actions can be set here
      if (['trip', 'spin'].includes(action)) this.forceWalkAfter = true;
      if (action === 'dance') this.forceThinkAfter = true;

      this.setNextAction();
    });
  }

  // helper to play a sequence of frames for a given number of loops
  playAnimation(frames, interval, loops, onComplete){
    let playCount=0, f=0;
    this.currentFrame=0;
    this.img.src=frames[0];
    if(this.frameTimer) clearInterval(this.frameTimer);

    this.frameTimer=setInterval(()=>{
        this.currentFrame=f=(f+1)%frames.length;
        this.img.src=frames[f];
        if(f===frames.length-1 && ++playCount>=loops){
            clearInterval(this.frameTimer);
            this.frameTimer=null;
            this.currentAction=null;
            this.actionCompletionTimer=setTimeout(onComplete,0);
        }
    }, interval);
  }

  // main animation loop --------------------------------------------------
  animate(time) {
    if (!this.lastTime) this.lastTime = time;
    const delta = (time - this.lastTime) / 1000;
    this.lastTime = time;
    if (this.isDragging || this.isFalling) {
        this.animationFrameId = requestAnimationFrame(this.animate);
        return;
    }
    const movingActions = ['walk', 'forced-walk', 'climbTop']; // add actions with horizontal movement here
    if (movingActions.includes(this.currentAction)) {
        const dx = this.direction * this.spriteConfig.walkspeed * delta;
        this.positionX += dx;
        this.setFacingFromDelta(dx);

        // flips sprites and movement direction upon reaching a wall
        if (this.positionX <= 0) {
            this.positionX = 0;
            this.direction = 1;
            this.facing = 'right';
            this.updateImageDirection();
        } else if (this.positionX >= this.maxPos) {
            this.positionX = this.maxPos;
            this.direction = -1;
            this.facing = 'left';
            this.updateImageDirection();
        }
        this.applyEdgeOffset();
    }

    if (this.currentAction === 'climbSide') {
      this.positionY += this.direction * this.spriteConfig.walkspeed * delta;

      if (this.currentEdge === 'left') {
        this.facing = 'left';
      } else if (this.currentEdge === 'right') {
        this.facing = 'right';
      }
      this.updateImageDirection();

      // flips sprites and movement direction upon reaching a wall
      const maxY = this.host.clientHeight - this.containerHeight;
      if (this.positionY <= 0) {
        this.positionY = 0;
        this.direction = 1;
      } else if (this.positionY >= maxY) {
        this.positionY = maxY;
        this.direction = -1;
      }
      this.applyEdgeOffset();
    }
    this.animationFrameId = requestAnimationFrame(this.animate);
  }
}
