* Bugs (major bugs above, minor bugs below)


1. UI elements don't show correctly on other platforms than mac: dropdown menu text color is the same as background color, visualizers aren't fit properly inside the visualizer window
2. Live mic visualization doesn't work when the only visualizer has mic recording on it.

—————————————————————

1. Side panel remains open in record mode
2. Exiting record mode before timer ends keeps continuing the timer, the timer should stop when exiting the mode
3. Exiting record mode before the timer ends makes the sound file play after the countdown ends, countdown keeps continuing after exiting early.

---

* Improvements (major on top, minor below)

1. Change the selection function along with button UI:
   Clicking on the layers will select only that one layer instead of selecting multiple at once. When selecting multiple layers the bottom UI wont show details. When only selecting one layer it will show the audio file name of the uploaded file and the layer name. To select multiple layers you can hold ctrl and click, and shift to select all layers between two layers (basically the same way you can select in file explorer). The selection works the same for mic recordings. Whenever you go from selecting layers to recordings and vice versa, it unselects the other type of object.
2. Change the current settings button to “visualizer settings” for currently selected visualizers in the side panel. If more than one is selected any value that isn't the same for selected visualizers will say “-”, if it's a slider it'll be in a default position. Changing any setting will do the change on all selected visualizers, so you will be able to see the values since they are the same.
3. When using the live mic, it sends to all visualizers. Change it so it will only send to currently selected visualizers
4. Add default sound tracks you can pick from, make choose file button ask if you want to use built in audio or custom audio
5. Add editable names to recordings in the recording section

—————————————————————

1. Layers will be labeled with “1”, “2” instead of “layer 1”, “layer 2”
2. Remove text next to “choose file” button which shows what file is uploaded
3. In the recordings section after you interact with a recording and then interact with a different one the previous one should have its slider and time go back to the start
4. Particle size setting for particle visualizer
5. Automatically disable mic input when stopping recording
6. Layers don't show what file is uploaded to them
7. Clicking the loop button after the file finishes playing causes the bar to continue moving
8. Particles don't stay in their position when the page goes small enough to make the visualizer window disappear
9. Change the “crystal” visualizer to “proximity dots”
10. Organization of layers by dragging (one at a time for now)
11. Button to toggle between showing all mic recording and all recording that are being used (uploaded to a visualizer)

---

* Additions (major above, minor below)

1. make it so when uploading video files it can take the audio from it
2. “Experimental features” button
3. moving, rotating, resizing (transforming) across the area where you see the visualizer
4. Global play/pause/stop buttons to toggle every layer.
5. new “multi gradient” coloring mode where you can make multiple gradients and just like the regular gradient coloring mode there's a bar but you can move the individual gradients across it
6. Visualizer: simply flashes the screen (based on average frequency if its too low it wont flash)
7. visualizer: “crystal wall” visualizer (similar to proximity dots), but the dots arent visible, they connect if they are within a certain distance, whenever there is a closed shape (triangle, 4 sided shapes, ect) and the shapes color changes with the frequency or with its middle point. (ask about more detailed info if you are confused)
8. Add backgrounds, image, visualizer, etc (think more in depth later)
9. “Intensity” setting (changes how sensitive the visualizer is)

—————————————————————

1. new button to download currently uploaded sound file from selected visualizers

---

* Things to remove

1. Certain settings only appearing for specific visualizer types, simply make the setting look darker and uneditable
