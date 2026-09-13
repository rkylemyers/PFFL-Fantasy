// Interactive SVG Football Field Renderer & Multi-Play Stack Engine
class FootballField {
  constructor(svgId) {
    this.svg = document.getElementById(svgId);
    this.width = 1200;
    this.height = 533;
    this.fieldYards = 120; // 100 yards + 2 x 10yd end zones
    this.yardWidth = this.width / this.fieldYards;
    this.leftTeamName = "MENTALCOW";
    this.rightTeamName = "WARHORSE";
    this.initField();
  }

  setTeamNames(leftName, rightName) {
    this.leftTeamName = (leftName || "HOME").toUpperCase();
    this.rightTeamName = (rightName || "AWAY").toUpperCase();
    this.initField();
  }

  initField() {
    if (!this.svg) return;
    this.svg.innerHTML = ''; // Clear

    // 1. Grass Field Base
    const grass = this.createSVGElement('rect', {
      x: 0, y: 0, width: this.width, height: this.height, fill: '#163816'
    });
    this.svg.appendChild(grass);

    // 2. Alternating 5-Yard Grass Stripes
    for (let i = 10; i < 110; i += 5) {
      if ((i / 5) % 2 === 0) {
        const stripe = this.createSVGElement('rect', {
          x: i * this.yardWidth,
          y: 0,
          width: 5 * this.yardWidth,
          height: this.height,
          fill: 'rgba(255, 255, 255, 0.03)'
        });
        this.svg.appendChild(stripe);
      }
    }

    // 3. End Zones (10 Yds each)
    const leftEndzone = this.createSVGElement('rect', {
      x: 0, y: 0, width: 10 * this.yardWidth, height: this.height, fill: '#7b1113'
    });
    const rightEndzone = this.createSVGElement('rect', {
      x: 110 * this.yardWidth, y: 0, width: 10 * this.yardWidth, height: this.height, fill: '#143059'
    });
    this.svg.appendChild(leftEndzone);
    this.svg.appendChild(rightEndzone);

    // End Zone Text Labels (Dynamic Team Names)
    const ezText1 = this.createSVGText(this.leftTeamName.substring(0, 12), 5 * this.yardWidth, this.height / 2, {
      fill: '#ffffff', 'font-size': '28px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(-90 50 ${this.height/2})`
    });
    const ezText2 = this.createSVGText(this.rightTeamName.substring(0, 12), 115 * this.yardWidth, this.height / 2, {
      fill: '#ffffff', 'font-size': '28px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(90 1150 ${this.height/2})`
    });
    this.svg.appendChild(ezText1);
    this.svg.appendChild(ezText2);

    // 4. White Boundary Lines & Yard Markings
    const boundary = this.createSVGElement('rect', {
      x: 10 * this.yardWidth, y: 0, width: 100 * this.yardWidth, height: this.height,
      fill: 'none', stroke: '#ffffff', 'stroke-width': '4'
    });
    this.svg.appendChild(boundary);

    // 5. 10-Yard Major Line Markers & Numbers
    for (let y = 10; y <= 110; y += 10) {
      const lineX = y * this.yardWidth;
      const line = this.createSVGElement('line', {
        x1: lineX, y1: 0, x2: lineX, y2: this.height,
        stroke: 'rgba(255, 255, 255, 0.7)', 'stroke-width': '2'
      });
      this.svg.appendChild(line);

      // Numbers (10, 20, 30, 40, 50, 40, 30, 20, 10)
      if (y > 10 && y < 110) {
        let fieldNum = y - 10;
        if (fieldNum > 50) fieldNum = 100 - fieldNum;

        const numBottom = this.createSVGText(fieldNum.toString(), lineX, this.height - 25, {
          fill: 'rgba(255, 255, 255, 0.6)', 'font-size': '22px', 'font-weight': '800', 'text-anchor': 'middle', 'font-family': 'Orbitron'
        });
        const numTop = this.createSVGText(fieldNum.toString(), lineX, 40, {
          fill: 'rgba(255, 255, 255, 0.6)', 'font-size': '22px', 'font-weight': '800', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(180 ${lineX} 40)`
        });
        this.svg.appendChild(numBottom);
        this.svg.appendChild(numTop);
      }
    }

    // Play Overlay Layer Group
    this.playLayer = this.createSVGElement('g', { id: 'play-layer' });
    this.svg.appendChild(this.playLayer);
  }

  // Render Last 5 Plays Stacked View
  // isRightToLeft: true for opponent team (moving right to left: 100 -> 0)
  renderPlayerLast5Plays(plays, isRightToLeft = false) {
    if (!this.playLayer) return;
    this.playLayer.innerHTML = ''; // Clear previous

    if (!plays || plays.length === 0) return;

    // Take up to 5 plays (most recent is index 0)
    const playList = plays.slice(0, 5);

    // Baseline Y positioning: Most recent play (index 0) is at the bottom (Y ~ 420), older plays stacked above it
    const baseY = 420;
    const ySpacing = 65; // Spacing between stacked play lines

    playList.forEach((play, index) => {
      // index 0 = Most recent play (largest, closest to bottom)
      // index 1..4 = Older plays (shrinking, stacked above)
      const shrinkFactor = 1 - (index * 0.15); // Scale down 100% -> 85% -> 70% -> 55% -> 40%
      const playY = baseY - (index * ySpacing);
      const isPos = play.isPos;
      const strokeColor = isPos ? '#00e676' : '#ff5252';
      const fillColor = isPos ? 'rgba(0, 230, 118, 0.25)' : 'rgba(255, 82, 82, 0.25)';

      let startX, endX;
      if (!isRightToLeft) {
        // Left to Right progression (My Team)
        startX = (10 + play.startYard) * this.yardWidth;
        endX = (10 + Math.min(100, Math.max(0, play.startYard + play.yards))) * this.yardWidth;
      } else {
        // Right to Left progression (Opponent Team)
        startX = (110 - play.startYard) * this.yardWidth;
        endX = (110 - Math.min(100, Math.max(0, play.startYard + play.yards))) * this.yardWidth;
      }

      // 1. Play Yardage Highlight Patch Box
      const boxMinX = Math.min(startX, endX);
      const boxWidth = Math.abs(endX - startX);
      const rectHeight = 36 * shrinkFactor;

      const playRect = this.createSVGElement('rect', {
        x: boxMinX,
        y: playY - (rectHeight / 2),
        width: Math.max(boxWidth, 10),
        height: rectHeight,
        fill: fillColor,
        stroke: strokeColor,
        'stroke-width': (2 * shrinkFactor).toString(),
        rx: '4'
      });
      this.playLayer.appendChild(playRect);

      // 2. Play Trajectory Line
      const pathLine = this.createSVGElement('line', {
        x1: startX, y1: playY, x2: endX, y2: playY,
        stroke: strokeColor, 'stroke-width': (5 * shrinkFactor).toString()
      });
      this.playLayer.appendChild(pathLine);

      // 3. Play Spot End Circle
      const spotCircle = this.createSVGElement('circle', {
        cx: endX, cy: playY, r: 12 * shrinkFactor,
        fill: strokeColor, stroke: '#ffffff', 'stroke-width': '2'
      });
      this.playLayer.appendChild(spotCircle);

      // 4. Play Badge Label (e.g. "PLAY 1: +5.60 PTS (18 YDS)")
      const labelText = index === 0 ? `MOST RECENT PLAY: ${play.pts} PTS` : `-${index} PLAY: ${play.pts} PTS`;
      const playText = this.createSVGText(labelText, (startX + endX) / 2, playY - (rectHeight / 2) - 4, {
        fill: strokeColor,
        'font-size': `${14 * shrinkFactor}px`,
        'font-weight': '900',
        'text-anchor': 'middle',
        'font-family': 'Orbitron'
      });
      this.playLayer.appendChild(playText);
    });
  }

  clearPlay() {
    if (this.playLayer) this.playLayer.innerHTML = '';
  }

  createSVGElement(tag, attrs) {
    const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (let key in attrs) {
      elem.setAttribute(key, attrs[key]);
    }
    return elem;
  }

  createSVGText(str, x, y, attrs) {
    const text = this.createSVGElement('text', { x: x, y: y, ...attrs });
    text.textContent = str;
    return text;
  }
}

window.FootballField = FootballField;
