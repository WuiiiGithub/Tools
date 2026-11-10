I will be talking to you regarding settings. 
In settings you have data operations. 
I suggest you make a new icon with labs/canonical flask svg with bubbles coming from where you can see again section nav at left and details of the section at right.
This section contains the following:
1. DataHub: Here, there is a search and listing of datasets. But also you have bottom right of the pannel svg button to upload data. When you upload data it asks you name. And that data is stored in local storage with that name. It doesn't except existing names. After uploading it will appear in the search list. And you can click upon it. It shows preview and you have < cancel > < use > buttons. When you press use. It goes further for pre-processing. As search results palletes appear at right you have delete option too which asks for confirmation before deletion in modal
2. Preprocessing: All as already discussed. It goes to the same preprocessing. 
There are 2 other tasks here. 
2.1. Regression 
2.2. Classification
This i will tell you in detail soon what this means.
3. Modeling: This should contain the following things
3.1. a drop down of loss functions 
3.2. a drop down for optimizer
3.3. that other thing regarding batch grad, mini batch grad, stochastic bla bla bla... all those in a drop down. idk what it is called.
3.4. learning rate set
3.5. validation split (its a decimal)
3.6. No. of epochs
You need not follow some specific order for this. Do whats best for UI/UX

# Regression
## Input
- Here you can take max 2 columns as input from dataset. Select those
- The input evolves via neural net to output
- If any feature is not provided then thats zero column or column full of zeros

## Output
- Same 2 features output
- Same if any features is not there then a zero column is good to go
- if classification task, the output becomes binary

## Graphing
- In regression, it should let the input evolve into wherever it leads during training as matrices,bias/space changes
- Points should be loaded only on red graph where all operations take place. 
- In slide bar instead of done you have play icon. As any edit is auto done don't need to click a button to save edit or render. its auto whenever you edit.
- On play, space should animate iteration by iteration i.e. epoch as space evolves. 
- In the end when the epochs get over the training. you have two things at right bottom at endge of right screen as svg buttons
    - A icon on clicking which you have actual points in blue space with non dotted point marker actual output where as you have another cluster of predicted points in their dotted point marker. This is a toggle like svg button.
    - Performance report button. On clikcing this opens the performance report. It contains the loss, validation loss vs epochs graph, classification report. If regression then a report made by various metrics

# Classification
Same as regression but few ofcourse change you can use your mind and build an awesome application
