// Interactive SVG Football Field Renderer & Play Highlight Engine
class FootballField {
  constructor(svgId) {
    this.svg = document.getElementById(svgId);
    this.width = 1200;
    this.height = 533;
    this.fieldYards = 120; // 100 yards + 2 x 10yd end zones
    this.yardWidth = this.width / this.fieldYards;
    this.initField();
  }

  initField() {
    if (!this.svg) return;
    this.svg.innerHTML = ''; // Clear

    // 1. Grass Field Base
    const grass = this.createSVGElement('rect', {
      x: 0, y: 0, width: this.width, height: this.height, fill: '#1b431b'
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
      x: 0, y: 0, width: 10 * this.yardWidth, height: this.height, fill: '#8b0000'
    });
    const rightEndzone = this.createSVGElement('rect', {
      x: 110 * this.yardWidth, y: 0, width: 10 * this.yardWidth, height: this.height, fill: '#00008b'
    });
    this.svg.appendChild(leftEndzone);
    this.svg.appendChild(rightEndzone);

    // End Zone Text Labels
    const ezText1 = this.createSVGText('PFFL', 5 * this.yardWidth, this.height / 2, {
      fill: '#fff', 'font-size': '36px', 'font-weight': '900', 'text-anchor': 'middle', transform: `rotate(-90 50 ${this.height/2})`
    });
    const ezText2 = this.createSVGText('PSYCHO', 115 * this.yardWidth, this.height / 2, {
      fill: '#fff', 'font-size': '36px', 'font-weight': '900', 'text-anchor': 'middle', transform: `rotate(90 1150 ${this.height/2})`
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

        const numBottom = this.createSVGText(fieldNum.toString(), lineX, this.height - 30, {
          fill: 'rgba(255, 255, 255, 0.6)', 'font-size': '24px', 'font-weight': '800', 'text-anchor': 'middle', 'font-family': 'Orbitron'
        });
        const numTop = this.createSVGText(fieldNum.toString(), lineX, 45, {
          fill: 'rgba(255, 255, 255, 0.6)', 'font-size': '24px', 'font-weight': '800', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(180 ${lineX} 40)`
        });
        this.svg.appendChild(numBottom);
        this.svg.appendChild(numTop);
      }
    }

    // Play Overlay Layer (Group)
    this.playLayer = this.createSVGElement('g', { id: 'play-layer' });
    this.svg.appendChild(this.playLayer);
  }

  // Draw Play Vector on SVG Field
  renderPlay(startYardLine, yardsGained, isPositive = true, playerHeadshot = '') {
    if (!this.playLayer) return;
    this.playLayer.innerHTML = ''; // Clear previous play animation

    // Convert NFL Yard Line to Field X Position (Assume 10-110 mapping)
    // startYardLine is 0-100 (0 = own goal line, 100 = opponent goal line)
    const startX = (10 + startYardLine) * this.yardWidth;
    const endYardLine = Math.min(100, Math.max(0, startYardLine + yardsGained));
    const endX = (10 + endYardLine) * this.yardWidth;
    const playY = this.height / 2;

    // 1. Line of Scrimmage (Blue)
    const losLine = this.createSVGElement('line', {
      x1: startX, y1: 10, x2: startX, y2: this.height - 10,
      stroke: '#00f2fe', 'stroke-width': '4', 'stroke-dasharray': '6,4'
    });
    this.playLayer.appendChild(losLine);

    // 2. Play Yardage Highlight Box
    const boxMinX = Math.min(startX, endX);
    const boxWidth = Math.abs(endX - startX);
    const playRect = this.createSVGElement('rect', {
      x: boxMinX, y: playY - 60, width: Math.max(boxWidth, 8), height: 120,
      fill: isPositive ? 'rgba(0, 230, 118, 0.25)' : 'rgba(255, 82, 82, 0.25)',
      stroke: isPositive ? '#00e676' : '#ff5252', 'stroke-width': '2', rx: '4'
    });
    this.playLayer.appendChild(playRect);

    // 3. Play Path Arrow
    const pathArrow = this.createSVGElement('line', {
      x1: startX, y1: playY, x2: endX, y2: playY,
      stroke: isPositive ? '#00e676' : '#ff5252', 'stroke-width': '6', 'marker-end': 'url(#arrow)'
    });
    this.playLayer.appendChild(pathArrow);

    // 4. Spot Ball / Player Headshot Circle
    const ballSpot = this.createSVGElement('circle', {
      cx: endX, cy: playY, r: 16,
      fill: isPositive ? '#00e676' : '#ff5252', stroke: '#ffffff', 'stroke-width': '3'
    });
    this.playLayer.appendChild(ballSpot);

    // Yardage badge text
    const textLabel = this.createSVGText(`${yardsGained > 0 ? '+' : ''}${yardsGained} YDS`, (startX + endX) / 2, playY - 70, {
      fill: isPositive ? '#00e676' : '#ff5252', 'font-size': '18px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron'
    });
    this.playLayer.appendChild(textLabel);
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

// Global instance handle
window.FootballField = FootballField;
