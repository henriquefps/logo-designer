import React, { useState } from 'react';
import * as Lucide from 'lucide-react';
import * as Phosphor from '@phosphor-icons/react';
import { svgToPngBlob, svgToDataUrl, generateIconPack } from '../utils/exportHelper';

const EXCLUDED_KEYS = ['createLucideIcon', 'default', 'LucideIcon', 'icons'];
const ALL_ICONS = Object.keys(Lucide).filter(
  key => !EXCLUDED_KEYS.includes(key) && 
         /^[A-Z]/.test(key) && 
         !key.startsWith('Lucide') && 
         !key.endsWith('Icon')
);

const EXCLUDED_PHOSPHOR = ['IconContext', 'IconBase', 'Icon'];
const ALL_PHOSPHOR_ICONS = Object.keys(Phosphor).filter(
  key => !EXCLUDED_PHOSPHOR.includes(key) && 
         /^[A-Z]/.test(key) && 
         !key.endsWith('Icon')
);

export default function ControlsPanel({
  canvasSettings,
  setCanvasSettings,
  elements,
  setElements,
  selectedElementId,
  setSelectedElementId,
  svgRef
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [phosphorSearchTerm, setPhosphorSearchTerm] = useState('');
  const [textInput, setTextInput] = useState('Text');
  const [activeTab, setActiveTab] = useState('canvas'); // canvas, elements, add
  const [exportSize, setExportSize] = useState(512); // 256, 512, 1024

  const selectedElement = elements.find(el => el.id === selectedElementId);

  // Filter icons
  const filteredIcons = ALL_ICONS.filter(name =>
    name.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 48); // limit to 48 for performance

  const filteredPhosphorIcons = ALL_PHOSPHOR_ICONS.filter(name =>
    name.toLowerCase().includes(phosphorSearchTerm.toLowerCase())
  ).slice(0, 48); // limit to 48 for performance

  // Add elements
  const addIcon = (iconName) => {
    const newEl = {
      id: Date.now().toString(),
      type: 'icon',
      iconType: 'lucide',
      name: iconName,
      x: 256,
      y: 256,
      size: 120,
      color: '#172e37',
      strokeWidth: 2,
      rotation: 0,
      opacity: 100
    };
    setElements([...elements, newEl]);
    setSelectedElementId(newEl.id);
  };

  const addPhosphorIcon = (iconName) => {
    const newEl = {
      id: Date.now().toString(),
      type: 'icon',
      iconType: 'phosphor',
      name: iconName,
      x: 256,
      y: 256,
      size: 120,
      color: '#172e37',
      weight: 'regular',
      rotation: 0,
      opacity: 100
    };
    setElements([...elements, newEl]);
    setSelectedElementId(newEl.id);
  };

  const addText = () => {
    if (!textInput.trim()) return;
    const newEl = {
      id: Date.now().toString(),
      type: 'text',
      text: textInput,
      x: 256,
      y: 256,
      size: 32,
      color: '#131b2e',
      fontFamily: 'Inter',
      fontWeight: 'bold',
      rotation: 0,
      opacity: 100
    };
    setElements([...elements, newEl]);
    setSelectedElementId(newEl.id);
    setTextInput('');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const newEl = {
        id: Date.now().toString(),
        type: 'image',
        src: event.target.result,
        name: file.name,
        x: 256,
        y: 256,
        size: 150,
        rotation: 0,
        opacity: 100
      };
      setElements([...elements, newEl]);
      setSelectedElementId(newEl.id);
    };
    reader.readAsDataURL(file);
  };

  // Element actions
  const updateSelected = (key, value) => {
    setElements(elements.map(el =>
      el.id === selectedElementId ? { ...el, [key]: value } : el
    ));
  };

  const updateSelectedMultiple = (updates) => {
    setElements(elements.map(el =>
      el.id === selectedElementId ? { ...el, ...updates } : el
    ));
  };

  const deleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const duplicateElement = (el) => {
    const newEl = {
      ...el,
      id: Date.now().toString(),
      x: el.x + 20,
      y: el.y + 20
    };
    setElements([...elements, newEl]);
    setSelectedElementId(newEl.id);
  };

  // Reordering layers
  const moveLayer = (direction) => {
    if (!selectedElementId) return;
    const index = elements.findIndex(el => el.id === selectedElementId);
    if (index === -1) return;

    const newElements = [...elements];
    if (direction === 'up' && index < elements.length - 1) {
      // Swap with next
      const temp = newElements[index];
      newElements[index] = newElements[index + 1];
      newElements[index + 1] = temp;
    } else if (direction === 'down' && index > 0) {
      // Swap with previous
      const temp = newElements[index];
      newElements[index] = newElements[index - 1];
      newElements[index - 1] = temp;
    } else if (direction === 'front') {
      // Move to end of array
      const temp = newElements.splice(index, 1)[0];
      newElements.push(temp);
    } else if (direction === 'back') {
      // Move to start of array
      const temp = newElements.splice(index, 1)[0];
      newElements.unshift(temp);
    }
    setElements(newElements);
  };

  // Export functions
  const handleDownloadSVG = () => {
    if (!svgRef.current) return;
    const url = svgToDataUrl(svgRef.current);
    const link = document.createElement('a');
    link.download = 'logogo-design.svg';
    link.href = url;
    link.click();
  };

  const handleDownloadPNG = async () => {
    if (!svgRef.current) return;
    try {
      const blob = await svgToPngBlob(svgRef.current, exportSize, exportSize);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `logogo-design-${exportSize}x${exportSize}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to export PNG.');
    }
  };

  const handleDownloadIconPack = async () => {
    if (!svgRef.current) return;
    try {
      const blob = await generateIconPack(svgRef.current);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'logogo-icon-pack.zip';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Failed to generate icon pack.');
    }
  };

  return (
    <div className="controls-panel">
      {/* Navigation tabs */}
      <div className="card"><div className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'canvas' ? 'active' : ''}`}
          onClick={() => setActiveTab('canvas')}
        >
          Canvas & Export
        </button>
        <button
          className={`tab-btn ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add Element
        </button>
        <button
          className={`tab-btn ${activeTab === 'elements' ? 'active' : ''}`}
          onClick={() => setActiveTab('elements')}
        >
          Layers ({elements.length})
        </button>
      </div></div>

      <div className="card">
        {activeTab === 'canvas' && (
          <div className="section-container">
            <div className="section-title">
              <span className="step-number">1</span>
              <h2>Background Settings</h2>
            </div>

            <div className="input-group">
              <label>Background Type</label>
              <select
                value={canvasSettings.bgType}
                onChange={(e) => setCanvasSettings({ ...canvasSettings, bgType: e.target.value })}
              >
                <option value="solid">Solid Color</option>
                <option value="gradient">Gradient</option>
                <option value="transparent">Transparent</option>
              </select>
            </div>

            <div className="input-group">
              <label>Background Shape</label>
              <select
                value={canvasSettings.bgShape || 'square'}
                onChange={(e) => setCanvasSettings({ ...canvasSettings, bgShape: e.target.value })}
              >
                <option value="square">Square</option>
                <option value="rounded">Rounded Square</option>
                <option value="squircle">Squircle (Smooth Rounded)</option>
                <option value="circle">Circle</option>
              </select>
            </div>

            {canvasSettings.bgType === 'solid' && (
              <div className="input-group">
                <label>Background Color</label>
                <div className="color-picker-row">
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={canvasSettings.bgColor}
                      onChange={(e) => setCanvasSettings({ ...canvasSettings, bgColor: e.target.value })}
                    />
                    <span className="text-xs uppercase font-mono">{canvasSettings.bgColor}</span>
                  </div>
                </div>
              </div>
            )}

            {canvasSettings.bgType === 'gradient' && (
              <div className="section-container border-l-2 border-slate-200/60 pl-4 mt-2">
                <div className="input-group">
                  <label>Gradient Start</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={canvasSettings.bgGradientStart}
                      onChange={(e) => setCanvasSettings({ ...canvasSettings, bgGradientStart: e.target.value })}
                    />
                    <span className="text-xs uppercase font-mono">{canvasSettings.bgGradientStart}</span>
                  </div>
                </div>

                <div className="input-group">
                  <label>Gradient End</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={canvasSettings.bgGradientEnd}
                      onChange={(e) => setCanvasSettings({ ...canvasSettings, bgGradientEnd: e.target.value })}
                    />
                    <span className="text-xs uppercase font-mono">{canvasSettings.bgGradientEnd}</span>
                  </div>
                </div>

                <div className="input-group">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <label>Gradient Angle</label>
                    <span>{canvasSettings.bgGradientAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={canvasSettings.bgGradientAngle}
                    onChange={(e) => setCanvasSettings({ ...canvasSettings, bgGradientAngle: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            )}

            <div className="section-title mt-4">
              <span className="step-number">2</span>
              <h2>Export Options</h2>
            </div>

            {/* PNG Resolution Selector using tabs-nav style */}
            <div className="resolution-selector select-none mb-4">
              <span className="resolution-selector-title text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">PNG Resolution</span>
              <div className=""><div className="tabs-nav mt-0 bg-slate-100">
                <button
                  type="button"
                  className={`tab-btn ${exportSize === 256 ? 'active' : ''}`}
                  onClick={() => setExportSize(256)}
                >
                  Small <span className="text-[10px] opacity-60 ml-0.5">(256px)</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${exportSize === 512 ? 'active' : ''}`}
                  onClick={() => setExportSize(512)}
                >
                  Medium <span className="text-[10px] opacity-60 ml-0.5">(512px)</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn ${exportSize === 1024 ? 'active' : ''}`}
                  onClick={() => setExportSize(1024)}
                >
                  Large <span className="text-[10px] opacity-60 ml-0.5">(1024px)</span>
                </button>
              </div></div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <button onClick={handleDownloadPNG} className="btn btn-primary w-full">
                <Lucide.Download size={16} /> Download PNG ({exportSize}px)
              </button>
              <button onClick={handleDownloadSVG} className="btn btn-secondary w-full">
                <Lucide.Code size={16} /> Download SVG
              </button>
              <button onClick={handleDownloadIconPack} className="btn btn-secondary w-full bg-slate-900 text-white hover:bg-slate-800">
                <Lucide.Archive size={16} /> Download Icon Pack (ZIP)
              </button>
            </div>
          </div>
        )}

        {activeTab === 'add' && (
          <div className="section-container">
            <div className="section-title">
              <span className="step-number">+</span>
              <h2>Add Element</h2>
            </div>

            {/* Sub-tabs for Add menu */}
            <details className="accordion-item" open>
              <summary className="accordion-header">
                <span>Lucide Icon</span>
                <Lucide.ChevronDown className="accordion-chevron" size={16} />
              </summary>
              <div className="accordion-body">
                <input
                  type="text"
                  placeholder="Search icons..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="mb-3"
                />
                <div className="grid grid-cols-8 gap-2 max-h-56 overflow-y-auto p-3 bg-slate-50 rounded-lg">
                  {filteredIcons.map(name => {
                    const IconComp = Lucide[name];
                    return (
                      <button
                        key={name}
                        title={name}
                        onClick={() => addIcon(name)}
                        className="aspect-square flex items-center justify-center bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg text-slate-700 hover:text-indigo-600 hover:border-indigo-200 transition-all cursor-pointer"
                      >
                        <IconComp size={20} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>

            <details className="accordion-item">
              <summary className="accordion-header">
                <span>Phosphor Icon</span>
                <Lucide.ChevronDown className="accordion-chevron" size={16} />
              </summary>
              <div className="accordion-body">
                <input
                  type="text"
                  placeholder="Search Phosphor icons..."
                  value={phosphorSearchTerm}
                  onChange={(e) => setPhosphorSearchTerm(e.target.value)}
                  className="mb-3"
                />
                <div className="grid grid-cols-8 gap-2 max-h-56 overflow-y-auto p-3 bg-slate-50 rounded-lg">
                  {filteredPhosphorIcons.map(name => {
                    const IconComp = Phosphor[name];
                    return (
                      <button
                        key={name}
                        title={name}
                        onClick={() => addPhosphorIcon(name)}
                        className="aspect-square flex items-center justify-center bg-white hover:bg-indigo-50 border border-slate-200 rounded-lg text-slate-700 hover:text-indigo-600 hover:border-indigo-200 transition-all cursor-pointer"
                      >
                        <IconComp size={20} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>

            <details className="accordion-item">
              <summary className="accordion-header">
                <span>Custom Text</span>
                <Lucide.ChevronDown className="accordion-chevron" size={16} />
              </summary>
              <div className="accordion-body">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter your text"
                  />
                  <button onClick={addText} className="btn btn-primary whitespace-nowrap">
                    Add
                  </button>
                </div>
              </div>
            </details>

            <details className="accordion-item">
              <summary className="accordion-header">
                <span>Custom Image</span>
                <Lucide.ChevronDown className="accordion-chevron" size={16} />
              </summary>
              <div className="accordion-body">
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-4 bg-white cursor-pointer hover:border-slate-500 transition-all">
                  <input
                    type="file"
                    accept="image/*"
                    id="img-upload"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <label htmlFor="img-upload" className="flex flex-col p-4 items-center cursor-pointer text-slate-500">
                    <Lucide.Upload size={24} className="mb-1" />
                    <span className="text-xs font-bold">Upload image</span>
                  </label>
                </div>
              </div>
            </details>
          </div>
        )}

        {activeTab === 'elements' && (
          <div className="section-container">
            <div className="section-title">
              <span className="step-number">L</span>
              <h2>Layers & Elements</h2>
            </div>

            {elements.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No elements added yet.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {[...elements].reverse().map(el => (
                  <div
                    key={el.id}
                    onClick={() => setSelectedElementId(el.id)}
                    className={`layer-item-row ${el.id === selectedElementId ? 'selected' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      {el.type === 'icon' && <Lucide.Sparkles size={16} className="text-indigo-600" />}
                      {el.type === 'text' && <Lucide.Type size={16} className="text-emerald-600" />}
                      {el.type === 'image' && <Lucide.Image size={16} className="text-amber-600" />}
                      <span className="text-xs font-bold truncate max-w-[120px]">
                        {el.type === 'icon' ? el.name : el.type === 'text' ? el.text : el.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => duplicateElement(el)}
                        title="Duplicate"
                        className="p-1 hover:bg-slate-200 rounded text-slate-600"
                      >
                        <Lucide.Copy size={12} />
                      </button>
                      <button
                        onClick={() => deleteElement(el.id)}
                        title="Delete"
                        className="p-1 hover:bg-red-100 rounded text-red-600"
                      >
                        <Lucide.Trash size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedElement && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Properties</h3>

                {/* Element Reordering */}
                <div className="reorder-btn-group mb-4">
                  <button onClick={() => moveLayer('back')} title="Send to Back" className="btn">
                    <Lucide.ChevronFirst size={14} />
                  </button>
                  <button onClick={() => moveLayer('down')} title="Move Down" className="btn">
                    <Lucide.ChevronLeft size={14} />
                  </button>
                  <button onClick={() => moveLayer('up')} title="Move Up" className="btn">
                    <Lucide.ChevronRight size={14} />
                  </button>
                  <button onClick={() => moveLayer('front')} title="Bring to Front" className="btn">
                    <Lucide.ChevronLast size={14} />
                  </button>
                </div>

                {/* Auto-Alignment Pad */}
                <div className="input-group mb-4">
                  <label>Quick Alignment</label>
                  <div className="alignment-grid">
                    {(() => {
                      const halfSize = selectedElement.type !== 'text' ? selectedElement.size / 2 : 0;
                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: Math.round(50 + halfSize),
                                y: Math.round(50 + halfSize)
                              });
                            }}
                            title="Top Left"
                            className="btn"
                          >
                            <Lucide.ArrowUpLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: 256,
                                y: Math.round(50 + halfSize)
                              });
                            }}
                            title="Top Center"
                            className="btn"
                          >
                            <Lucide.ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: Math.round(462 - halfSize),
                                y: Math.round(50 + halfSize)
                              });
                            }}
                            title="Top Right"
                            className="btn"
                          >
                            <Lucide.ArrowUpRight size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: Math.round(50 + halfSize),
                                y: 256
                              });
                            }}
                            title="Center Left"
                            className="btn"
                          >
                            <Lucide.ArrowLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: 256,
                                y: 256
                              });
                            }}
                            title="Center All"
                            className="btn"
                          >
                            <Lucide.Maximize2 size={12} className="text-indigo-600" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: Math.round(462 - halfSize),
                                y: 256
                              });
                            }}
                            title="Center Right"
                            className="btn"
                          >
                            <Lucide.ArrowRight size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: Math.round(50 + halfSize),
                                y: Math.round(462 - halfSize)
                              });
                            }}
                            title="Bottom Left"
                            className="btn"
                          >
                            <Lucide.ArrowDownLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: 256,
                                y: Math.round(462 - halfSize)
                              });
                            }}
                            title="Bottom Center"
                            className="btn"
                          >
                            <Lucide.ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateSelectedMultiple({
                                x: Math.round(462 - halfSize),
                                y: Math.round(462 - halfSize)
                              });
                            }}
                            title="Bottom Right"
                            className="btn"
                          >
                            <Lucide.ArrowDownRight size={14} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {selectedElement.type === 'text' && (
                  <div className="input-group">
                    <label>Edit Text</label>
                    <input
                      type="text"
                      value={selectedElement.text}
                      onChange={e => updateSelected('text', e.target.value)}
                    />
                  </div>
                )}

                {/* Edit Color for Icons and Texts */}
                {(selectedElement.type === 'icon' || selectedElement.type === 'text') && (
                  <div className="input-group">
                    <label>Color</label>
                    <div className="color-input-wrapper">
                      <input
                        type="color"
                        value={selectedElement.color || '#000000'}
                        onChange={e => updateSelected('color', e.target.value)}
                      />
                      <span className="text-xs uppercase font-mono">{selectedElement.color}</span>
                    </div>
                  </div>
                )}

                {/* Dimensions, Scale, Rotate, Opacity */}
                <div className="input-group">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <label>Size</label>
                    <span>{selectedElement.size}px</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="1000"
                    value={selectedElement.size}
                    onChange={e => updateSelected('size', parseInt(e.target.value))}
                  />
                </div>

                {selectedElement.type === 'icon' && selectedElement.iconType === 'phosphor' && (
                  <div className="input-group">
                    <label>Icon Weight</label>
                    <select
                      value={selectedElement.weight || 'regular'}
                      onChange={e => updateSelected('weight', e.target.value)}
                    >
                      <option value="thin">Thin</option>
                      <option value="light">Light</option>
                      <option value="regular">Regular</option>
                      <option value="bold">Bold</option>
                      <option value="fill">Fill</option>
                      <option value="duotone">Duotone</option>
                    </select>
                  </div>
                )}

                {selectedElement.type === 'icon' && selectedElement.iconType !== 'phosphor' && (
                  <div className="input-group">
                    <div className="flex justify-between text-xs font-bold text-slate-500">
                      <label>Stroke Width</label>
                      <span>{selectedElement.strokeWidth}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="4"
                      step="0.1"
                      value={selectedElement.strokeWidth}
                      onChange={e => updateSelected('strokeWidth', parseFloat(e.target.value))}
                    />
                  </div>
                )}

                <div className="input-group">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <label>Rotation</label>
                    <span>{selectedElement.rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={selectedElement.rotation}
                    onChange={e => updateSelected('rotation', parseInt(e.target.value))}
                  />
                </div>

                <div className="input-group">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <label>Opacity</label>
                    <span>{selectedElement.opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedElement.opacity}
                    onChange={e => updateSelected('opacity', parseInt(e.target.value))}
                  />
                </div>

                {/* Mirror / Flip Controls */}
                <div className="input-group">
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Flip / Mirror</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateSelected('flipH', !selectedElement.flipH)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border transition-all text-sm font-medium ${
                        selectedElement.flipH
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Flip Horizontally"
                    >
                      <Lucide.FlipHorizontal size={16} />
                      <span>Horizontal</span>
                    </button>
                    <button
                      onClick={() => updateSelected('flipV', !selectedElement.flipV)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border transition-all text-sm font-medium ${
                        selectedElement.flipV
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title="Flip Vertically"
                    >
                      <Lucide.FlipVertical size={16} />
                      <span>Vertical</span>
                    </button>
                  </div>
                </div>

                {/* X & Y position details */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="input-group">
                    <label>Position X</label>
                    <input
                      type="number"
                      value={selectedElement.x}
                      onChange={e => updateSelected('x', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="input-group">
                    <label>Position Y</label>
                    <input
                      type="number"
                      value={selectedElement.y}
                      onChange={e => updateSelected('y', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
