* Bugs (major bugs above, minor bugs below)


1. UI elements don't show correctly on other platforms than mac: dropdown menu text color is the same as background color, visualizers aren't fit properly inside the visualizer window (i havent checked this yet)

—————————————————————



---


* Improvements (major on top, minor below)


1. Change the selection function along with button UI:
  Clicking on the layers will select only that one layer instead of selecting multiple at once. When selecting multiple layers the bottom UI won't show details. When only selecting one layer it will show the audio file name of the uploaded file and the layer name. To select multiple layers you can hold ctrl and click, and shift to select all layers between two layers (basically the same way you can select in file explorer). The selection works the same for mic recordings. Whenever you go from selecting layers to recordings and vice versa, it unselects the other type of object.
2. Change the current settings button to “visualizer settings” for currently selected visualizers in the side panel. If more than one is selected any value that isn't the same for selected visualizers will say “-”, if it's a slider it'll be in a default position. Changing any setting will do the change on all selected visualizers and you will be able to see the values since they are the same.
3. When using the live mic, it sends to all visualizers. Change it so it will only send to currently selected visualizers
4. Add default sound tracks you can pick from, make choose file button ask if you want to use built in audio or custom audio (I will send over the built in audio files after the function is implemented.
5. Add editable names to recordings in the recording section (may require increasing the size of recording files visually)


—————————————————————


1. Button to filter between showing all mic recordings that exist and all recordings that are being used (uploaded to a visualizer)
2. Remove text next to “choose file” button which shows what file is uploaded
3. In the recordings section after you interact with a recording and then interact with a different one the previous one should have its slider and time go back to the start (example- you hit play on a recording, hitting play on another recording will stop the first one)
4. Particle size setting for particle visualizer
5. Automatically disable mic input when stopping recording
6. recording layers don't show what file is uploaded to them
7. Clicking the loop button after the file finishes playing causes the bar to continue moving
8. Make “constellation” more sensitive by default
9. Organization of layers by dragging from a drag icon on the left of the layer (one at a time for now)
10. Whenever a pop-up happens (please select a layer, etc) make a custom popup for the website instead of using the browser's alert function (or whatever is being used right now)


---


* Additions (major above, minor below)


1. make it so when uploading video files it can take the audio from it
2. “Experimental features” button
3. language button to switch languages, it won't affect filenames and manually named layers
4. Global play/pause/stop buttons to toggle every layer.
5. new “multi gradient” coloring mode where you can make multiple gradients and just like the regular gradient coloring mode there's a bar but you can move the individual gradients across it
6. Visualizer: simply flashes the screen (based on average frequency if its too low it wont flash)
7. visualizer: “crystal wall” visualizer (similar to constellation), but the dots aren't visible, they connect if they are within a certain distance, whenever there is a closed shape (triangle, 4 sided shapes, ect) and the shapes color changes with the frequency or with its middle point. (ask about more detailed info if you are confused)
8. Add backgrounds, image, visualizer, etc (think more in depth later)
9. “Intensity” setting (changes how sensitive the visualizer is)
10. when opening the page it gives a short tutorial on how the site works, a window with text will explain with an x in the corner to close it and a continue button
11. a “refresh visualizers” button which will for example put the particles in particle visualizer in random locations again
12. moving, rotating, resizing (transforming) visualizers across the area


—————————————————————


1. new button to download currently uploaded sound file from selected visualizers
2. when drag to move is implemented in layers, add dragging multiple layers at once


---


* Things to remove


1. Certain settings only appearing for specific visualizer types, simply make the setting look darker and uneditable in the settings panel