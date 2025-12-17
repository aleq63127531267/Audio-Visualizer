Things to add to visualizer:

1. Live visualization from mic   
   * add UI on the bottom of the screen next to current UI with a line in between  
     - [ ] toggle mic input button, when its on it pauses any visualizers that are currently playing and any selected visualizers will show the mic input  
     - [ ] select input device button (automatically use default input on opening)   
     - [ ] record button to record and automatically upload to selected visualizers

2. improve visualizers  
   * customization for visualizers  
     - [ ] moving, rotating, resizing (transforming) across the area where you see the visualizer  
     - [ ] adding visualizers to have multiple at once  
     - [ ] editing individual visualizers (colors and settings)  
     - [ ] choosing different sound files for each visualizer  
   * more visualizers  
     - [ ] “crystal wall” visualizer where there's a bunch of points like the particle visualizer (but you don't see the points) and they are connected to make shapes (triangles and/or 4 sided shapes) and the shapes color changes with the frequency  
   * more color customization  
     - [ ] new “multi gradient” coloring mode where you can make multiple gradients and just like the regular gradient coloring mode there's a bar but you can move the individual gradients across it

3. improve UI  
   * modifications to top bar  
     - [ ] move title to the left  
     - [ ] add a drop-down menu to switch between different tools (just audio visualizer for now)  
   * side panel that you can toggle on and off  
     - [ ] see all visualizers and organize them by dragging (similar to layers in drawing software)  
     - [ ] Buttons to add visualizer, remove selected visualizers and move visualizers up or down a layer  
     - [ ] different options for each visualizer: select (like a check box) hide/show, opacity, intensity (change how sensitive the visualizer is). at the top have the same buttons which will do the action across all visualizers  
     - [ ] lower section of the panel which shows all recorded audios using the mic  
     - [ ] button to toggle between showing all mic recording and all recording that are being used (uploaded to a visualizer)  
     - [ ] Button to remove mic recording with a confirmation window  
     - [ ] Button to select multiple mic recording files (only used for deleting multiple recording at the moment)  
   * Modifications to bottom UI  
     - [ ] If only one visualizer is selected from the side panel it will act as normal, if multiple are selected all buttons will send an action to every selected visualizer  
     - [ ] Global play, pause and stop buttons that affect every visualizer ignoring selected visualizers  
   * change settings button  
     - [ ] change current settings button to “visualizer settings” for currently selected visualizers in the side panel. if more than one is selected any setting that isn't the same for selected visualizers will say “-”, if it's a slider it'll be in a default position  
   * download button  
     - [ ] new button to download currently uploaded sound file from selected visualizers