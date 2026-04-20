# ACTION

# Action

## `OBR.action`[​](#obraction)

An extensions action is shown in the top left of a room.

When an action is clicked a popover will be shown for that action.

The action is defined in the extensions [Manifest](/extensions/reference/manifest) file.

# Reference

## Methods[​](#methods)

### `getWidth`[​](#getwidth)

```
async getWidth()

```

Get the action popovers width.

Returns a number or undefined.

### `setWidth`[​](#setwidth)

```
async setWidth(width)

```

Set the action popovers width.

**Parameters**
NAMETYPEDESCRIPTIONwidthnumberThe new width of the popover
### `getHeight`[​](#getheight)

```
async getHeight()

```

Get the action popovers height.

Returns a number or undefined.

### `setHeight`[​](#setheight)

```
async setHeight(height)

```

Set the action popovers height.

**Parameters**
NAMETYPEDESCRIPTIONheightnumberThe new height of the popover
### `getBadgeText`[​](#getbadgetext)

```
async getBadgeText()

```

Get the actions badge text.

Returns a string or undefined.

### `setBadgeText`[​](#setbadgetext)

```
async setBadgeText(badgeText)

```

Set the actions badge text.

**Parameters**
NAMETYPEDESCRIPTIONbadgeTextstringThe new badge text of the action. Set as `undefined` to remove the badge
### `getBadgeBackgroundColor`[​](#getbadgebackgroundcolor)

```
async getBadgeBackgroundColor()

```

Get the actions badge background color.

Returns a string or undefined.

### `setBadgeBackgroundColor`[​](#setbadgebackgroundcolor)

```
async setBadgeBackgroundColor(badgeBackgroundColor)

```

Set the actions badge background color.

**Parameters**
NAMETYPEDESCRIPTIONbadgeBackgroundColorstringThe new badge background color of the action
### `getIcon`[​](#geticon)

```
async getIcon()

```

Get the actions icon.

Returns a string.

### `setIcon`[​](#seticon)

```
async setIcon(icon)

```

Set the actions icon.

**Parameters**
NAMETYPEDESCRIPTIONiconstringThe new icon of the action
### `getTitle`[​](#gettitle)

```
async getTitle()

```

Get the actions title.

Returns a string.

### `setTitle`[​](#settitle)

```
async setTitle(title)

```

Set the actions title.

**Parameters**
NAMETYPEDESCRIPTIONtitlestringThe new title of the action
### `open`[​](#open)

```
async open()

```

Open the action.

### `close`[​](#close)

```
async close()

```

Close the action.

### `isOpen`[​](#isopen)

```
async isOpen()

```

Returns true if the action is open

### `onOpenChange`[​](#onopenchange)

```
onOpenChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(isOpen: boolean) => voidA callback for when the action is opened or closed
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onOpenChange` event with a React `useEffect`.
 * `onOpenChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.action.onOpenChange((isOpen) => {
      // React to the action opening or closing
    }),
  []
);

```

---

# ASSETS

# Assets

## `OBR.assets`[​](#obrassets)

The assets API allows you to interact with the current users storage.

# Reference

## Methods[​](#methods)

### `uploadImages`[​](#uploadimages)

```
async uploadImages(images, typeHint)

```

Open a folder picker to allow a user to upload the given `images`.

**Parameters**
NAMETYPEDESCRIPTIONimages[ImageUpload](#imageupload)[]The images to uploadtypeHint[ImageAssetType](#imageassettype)An optional hint for which image type to use when uploading
**Example**

Upload images from a HTMLInputElement element using the [ImageUploadBuilder](/extensions/reference/builders/image-upload)

```
import OBR, { buildImageUpload } from "@owlbear-rodeo/sdk";

<input
  type="file"
  onChange={async (e) => {
    const files = e.target.files;
    if (files) {
      const uploads = [];
      for (const file of files) {
        // Note: we need to create a new file from the contents of the input file.
        // This needs to be done due to browser security policies for sharing files
        const data = await file.arrayBuffer();
        const newFile = new File([data], file.name, { type: file.type });
        uploads.push(buildImageUpload(newFile).build());
      }
      await OBR.assets.uploadImages(uploads);
    }
  }}
/>;

```

### `uploadScenes`[​](#uploadscenes)

```
async uploadScenes(scenes, disableShowScenes)

```

Open a folder picker to allow a user to upload the given `scenes`.

**Parameters**
NAMETYPEDESCRIPTIONscenes[SceneUpload](#sceneupload)[]The scenes to uploaddisableShowScenesbooleanAn optional flag to disable showing the Atlas after uploading the new scenes
**Examples**

Upload a new empty scene with a hexagon grid using the [SceneUploadBuilder](/extensions/reference/builders/scene-upload)

```
import OBR, { buildSceneUpload } from "@owlbear-rodeo/sdk";

const scene = buildSceneUpload()
  .gridType("HEX_HORIZONTAL")
  .name("Hex Scene")
  .build();
OBR.assets.uploadScenes([scene]);

```

Upload a new scene with a map from a HTMLInputElement

```
import OBR, { buildSceneUpload, buildImageUpload } from "@owlbear-rodeo/sdk";

<input
  type="file"
  onChange={async (e) => {
    const files = e.target.files;
    if (files) {
      const file = files[0];
      // Note: we need to create a new file from the contents of the input file.
      // This needs to be done due to browser security policies for sharing files
      const data = await file.arrayBuffer();
      const newFile = new File([data], file.name, { type: file.type });
      const image = buildImageUpload(newFile).build();
      const scene = buildSceneUpload()
        .baseMap(image)
        .name("Image Scene")
        .build();
      await OBR.assets.uploadScenes([scene]);
    }
  }}
/>;

```

### `downloadImages`[​](#downloadimages)

```
async downloadImages(multiple, defaultSearch, typeHint)

```

Open an image picker to allow a user to share images with the extension.

Returns an array of [ImageDownload](#imagedownload)s

**Parameters**
NAMETYPEDESCRIPTIONmultiplebooleanAn optional boolean, if true the user can pick multiple imagesdefaultSearchstringAn optional default value for the search input in the image pickertypeHint[ImageAssetType](#imageassettype)An optional hint for which image type to select
### `downloadScenes`[​](#downloadscenes)

```
async downloadScenes(multiple, defaultSearch)

```

Open a scene picker to allow a user to share scenes with the extension.

Returns an array of [SceneDownload](#scenedownload)s

**Parameters**
NAMETYPEDESCRIPTIONmultiplebooleanAn optional boolean, if true the user can pick multiple scenesdefaultSearchstringAn optional default value for the search input in the scene picker
## Type Definitions[​](#type-definitions)

### ImageUpload[​](#imageupload)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONfileFile | BlobThe image file to uploadnamestringThe name of the new image, if left blank and a File input is used the `file.name` property will be usedgrid[ImageGrid](/extensions/reference/items/image#imagegrid)The default grid settings for this imagerotationnumberThe default rotation for this image in degreesscale[Vector2](/extensions/reference/vector2)The default scale for this imagetext[TextContent](/extensions/reference/text-content)The text displayed over the imagetextItemType"LABEL" | "TEXT"The type of text to use for this image. The "LABEL" option will display the text as a label on the bottom of the image. The "TEXT" option will display the text over the top of the image.visiblebooleanThe default visible settings for this imagelockedbooleanThe default locked settings for this imagedescriptionstringAn optional description of the item used by assistive technology
### SceneUpload[​](#sceneupload)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONnamestringThe name of the scenegrid[Grid](/extensions/apis/scene/grid#grid-1)The grid for the scenefog[Fog](/extensions/apis/scene/fog#fog-1)The fog settings for the sceneitems[Item](/extensions/reference/items/item)[]The default items for the scenebaseMap[ImageUpload](#imageupload)An optional map image that will be used as the base for this scenethumbnailFile | BlobAn optional image file to use as the initial thumbnail for the scene
### ImageDownload[​](#imagedownload)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONnamestringThe name of the imageimage[ImageContent](/extensions/reference/items/image#imagecontent)The image contentsgrid[ImageGrid](/extensions/reference/items/image#imagegrid)The grid settings for this imagerotationnumberThe rotation for this image in degreesscale[Vector2](/extensions/reference/vector2)The scale for this imagetext[TextContent](/extensions/reference/text-content)The text displayed over the imagetextItemType"LABEL" | "TEXT"The type of text to use for this image. The "LABEL" option will display the text as a label on the bottom of the image. The "TEXT" option will display the text over the top of the image.visiblebooleanThe visible settings for this imagelockedbooleanThe locked settings for this imagedescriptionstringAn optional description of the item used by assistive technologytype[ImageAssetType](#imageassettype)The type of this image
### SceneDownload[​](#scenedownload)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONnamestringThe name of the scenegrid[Grid](/extensions/apis/scene/grid#grid-1)The grid for the scenefog[Fog](/extensions/apis/scene/fog#fog-1)The fog settings for the sceneitems[Item](/extensions/reference/items/item)[]The items for the scene
### ImageAssetType[​](#imageassettype)

TYPEvaluesstring"MAP" | "PROP" | "MOUNT" | "CHARACTER" | "ATTACHMENT" | "NOTE"

---

# BROADCAST

# Broadcast

## `OBR.broadcast`[​](#obrbroadcast)

The broadcast api allows you to send ephemeral messages to other players in the room.

# Reference

## Methods[​](#methods)

### `sendMessage`[​](#sendmessage)

```
async sendMessage(channel, data)

```

Send a message to other players on a given channel.

**Parameters**
NAMETYPEDESCRIPTIONchannelstringThe channel to send todataanyAny value that can be JSON serialized. Limited to 16KB in sizeoptions[BroadcastOptions](#broadcastoptions)Options to control how the message is sent (optional)
**Example**

```
OBR.broadcast.sendMessage("rodeo.owlbear.example", "Hello, World!");

```

### `onMessage`[​](#onmessage)

```
onMessage(channel, callback);

```

**Parameters**
NAMETYPEDESCRIPTIONchannelstringThe channel to receive fromcallback(event: [BroadcastEvent](#broadcastevent)) => voidA callback for when a message is sent from another player on this channel
Returns a function that when called will unsubscribe from message events for this channel.

**Example**

```
/**
 * Use an `onMessage` event with a React `useEffect`.
 * `onMessage` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.broadcast.onMessage("rodeo.owlbear.example", (event) => {
      // Use the data from the event
    }),
  []
);

```

## Type Definitions[​](#type-definitions)

### BroadcastEvent[​](#broadcastevent)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONdataanyThe data for this eventconnectionIdstringThe connection id of the player who sent the event
### BroadcastOptions[​](#broadcastoptions)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONdestination"REMOTE" | "LOCAL" | "ALL"Choose where the broadcast is sent. "REMOTE" sends to other connected players, "LOCAL" will send to the current player and "ALL" will send to all connected players. Defaults to "REMOTE"

---

# CONTEXT-MENU

# Context Menu

## `OBR.contextMenu`[​](#obrcontextmenu)

A context menu is shown when an item is selected, this API allows you to extend that menu with custom buttons.

# Reference

## Methods[​](#methods)

### `create`[​](#create)

```
async create(contextMenu)

```

Create a context menu item.

**Parameters**
NAMETYPEDESCRIPTIONcontextMenu[ContextMenuItem](#contextmenuitem)The context menu item to create
### `remove`[​](#remove)

```
async remove(id)

```

Remove a context menu item.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the context menu to remove
## Type Definitions[​](#type-definitions)

### ContextMenuItem[​](#contextmenuitem)

A single context menu item.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONidstringThe ID of this context menu itemicons[ContextMenuIcon](#contextmenuicon)[]An array of icons to useonClick[ContextMenuClickHandler](#contextmenuclickhandler)A callback function triggered when the context menu item is clickedshortcutstringAn optional key combination to use as a shortcutembed[ContextMenuEmbed](#contextmenuembed)An optional embedded url to provide custom controls in the context menu
### ContextMenuIcon[​](#contextmenuicon)

An icon for a context menu item.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONiconstringThe url of the icon as either a relative or absolute pathlabelstringThe label to use for the tooltip of the iconfilter[ContextMenuIconFilter](#contextmenuiconfilter)An optional filter to control when this icon will be shown
### ContextMenuIconFilter[​](#contextmenuiconfilter)

A filter to control when an icon will be shown.
If this filter returns true then this icon will be shown.
If no filter returns true then the context menu item won&#x27;t be shown.TYPEobject
**Properties**
NAMETYPEDESCRIPTIONminnumberAn optional minimum number of items selected, defaults to 1maxnumberAn optional maximum number of items selectedpermissions("UPDATE" | "DELETE" | "CREATE" | [Permission](/extensions/reference/permission))[]An optional array of permissions needed for the selected items, defaults to no permissions neededroles("GM" | "PLAYER")[]An optional array of roles needed for the player, defaults to no role neededevery[KeyFilter](/extensions/reference/filters#keyfilter)[]An optional array of filters to run on the selected items. Every item must pass this filter for a successsome[KeyFilter](/extensions/reference/filters#keyfilter)[]An optional array of filters to run on the selected items. Only one item must pass this filter for a success
### ContextMenuClickHandler[​](#contextmenuclickhandler)

A callback when a context menu item is clicked.
TYPEfunction
**Parameters**
NAMETYPEDESCRIPTIONcontext[ContextMenuContext](#contextmenucontext)The context for this menuelementIdstringThe ID of the button clicked
### ContextMenuContext[​](#contextmenucontext)

The context for a menu item.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONitems[Item](/extensions/reference/items/item)[]An array of Items that are currently selectedselectionBounds[BoundingBox](/extensions/reference/bounding-box)A bounding box for the current selection
### ContextMenuEmbed[​](#contextmenuembed)

An embedded view in the context menu popup.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONurlstringThe url of the site to embedheightnumberAn optional height of the embed in pixels

---

# INTERACTION

# Interaction

## `OBR.interaction`[​](#obrinteraction)

Manage interactions with Owlbear Rodeo.

An interaction allows you to provide high frequency updates to Owlbear Rodeo without needing to worry about networking.

Interactions in Owlbear Rodeo use an interpolated snapshot system where high frequency updates are applied in real-time locally but sampled at a lower frequency to be sent over the network to other players.

On the receiving end low frequency snapshots are buffered and interpolated to ensure smooth playback.
Not all item values are available when using an interaction.
See [here](#interactive-values) for available values.
# Reference

## Methods[​](#methods)

### `startItemInteraction`[​](#startiteminteraction)

```
async startItemInteraction(items)

```

Start an interaction with an item or a list of items in a scene.

These items can be newly created or be references to already existing items in the scene.

Interaction Time LimitTo prevent accidental network usage interactions expire after 30 seconds.

When this happens the interaction will stop sending network traffic but new updates will still be applied locally.

**Parameters**
NAMETYPEDESCRIPTIONbaseState[Item](/extensions/reference/items/item) | [Item](/extensions/reference/items/item)[]The item or items to interact with
Returns an [InteractionManager](#interactionmanager) that can be used to update and stop this interaction.

**Example**

```
/**
 * Create a pointer tool mode that starts an interaction on drag start,
 * updates that interaction on drag move and stops the interaction
 * on drag end/cancel.
 */
let interaction = null;
OBR.tool.createMode({
  id: "com.example.pointer",
  icons: [
    {
      icon: "/icon.svg",
      label: "Custom Pointer",
      filter: {
        activeTools: ["rodeo.owlbear.tools/pointer"],
      },
    },
  ],
  async onToolDragStart(_, event) {
    const pointer = buildPointer().position(event.pointerPosition).build();
    interaction = await OBR.interaction.startItemInteraction(pointer);
  },
  onToolDragMove(_, event) {
    if (interaction) {
      const [update] = interaction;
      update((pointer) => {
        pointer.position = event.pointerPosition;
      });
    }
  },
  onToolDragEnd() {
    if (interaction) {
      const [_, stop] = interaction;
      stop();
    }
    interaction = null;
  },
  onToolDragCancel() {
    if (interaction) {
      const [_, stop] = interaction;
      stop();
    }
    interaction = null;
  },
});

```

## Type Definitions[​](#type-definitions)

### InteractionManager[​](#interactionmanager)

TYPEarray
**Properties**
INDEXNAMETYPEDESCRIPTION0updateDispatchInteractionUpdateA function to dispatch updates to this interaction1stopfunctionA function to stop the interaction
### DispatchInteractionUpdate[​](#dispatchinteractionupdate)

Interaction&#x27;s use [Immer](https://immerjs.github.io/immer/) to provide updates.
This function represents an Immer producer that provides a recipe for making immutable updates.TYPEfunctionNAMETYPEDESCRIPTIONupdateUpdateInteractionA callback to apply an update to the previous state of this interaction
### UpdateInteraction[​](#updateinteraction)

An [Immer](https://immerjs.github.io/immer/) recipe for updating the current state of an interaction.
TYPEfunctionNAMETYPEDESCRIPTIONdraft[Draft](https://immerjs.github.io/immer/)An immer draft of the current state
## Interactive Values[​](#interactive-values)

When you update a value using an interaction a faster rendering path will be used.
This fast path works by skipping the processing of any hierarchy data and updating values directly on the renderer.
Because of this method not all parameters are available when changing values in an interaction.
Below is a list of items and the values that can be updated in an interaction:

### [Item](/extensions/reference/items/item)[​](#item)

NAMETYPEDESCRIPTIONposition[Vector2](/extensions/reference/vector2)The position of this itemrotationnumberThe rotation of this item in degreesscale[Vector2](/extensions/reference/vector2)The scale of this item
### [Curve](/extensions/reference/items/curve)[​](#curve)

NAMETYPEDESCRIPTIONpoints[Vector2](/extensions/reference/vector2)[]The list of points to draw
### [Image](/extensions/reference/items/image)[​](#image)

NAMETYPEDESCRIPTIONimage[ImageContent](/extensions/reference/items/image#imagecontent)Only the `width` and `height` of the image contentgrid[ImageGrid](/extensions/reference/items/image#imagegrid)The grid scale of the image
### [Label](/extensions/reference/items/label)[​](#label)

NAMETYPEDESCRIPTIONtext[TextContent](/extensions/reference/text-content)Only the `plainText` can be updated
### [Line](/extensions/reference/items/line)[​](#line)

NAMETYPEDESCRIPTIONstartPosition[Vector2](/extensions/reference/vector2)The start position of the lineendPosition[Vector2](/extensions/reference/vector2)The end position of the line
### [Path](/extensions/reference/items/path)[​](#path)

NAMETYPEDESCRIPTIONcommands[PathCommand](#pathcommand)[]The list of drawing commands
### [Ruler](/extensions/reference/items/ruler)[​](#ruler)

NAMETYPEDESCRIPTIONstartPosition[Vector2](/extensions/reference/vector2)The start position of the rulerendPosition[Vector2](/extensions/reference/vector2)The end position of the rulermeasurementstringThe value to display on the ruler
### [Shape](/extensions/reference/items/shape)[​](#shape)

NAMETYPEDESCRIPTIONwidthnumberThe width of the shapeheightnumberThe height of the shape
--

---

# MODAL

# Modal

## `OBR.modal`[​](#obrmodal)

The modal API allows you to display custom UI over the top of the Owlbear Rodeo interface as a modal.

# Reference

## Methods[​](#methods)

### `open`[​](#open)

```
async open(modal)

```

Open a new modal.

**Parameters**
NAMETYPEDESCRIPTIONmodal[Modal](#modal-1)The modal to open
**Example**

```
OBR.contextMenu.create({
  id: "rodeo.owlbear.example",
  icons: [
    {
      icon: "icon.svg",
      label: "Example",
    },
  ],
  onClick() {
    OBR.modal.open({
      id: "rodeo.owlbear.example/modal",
      url: "/modal",
      height: 300,
      width: 400,
    });
  },
});

```

### `close`[​](#close)

```
async close(id)

```

Close an open modal.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the modal to close
## Type Definitions[​](#type-definitions)

### Modal[​](#modal-1)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONidstringThe ID of this modalurlstringThe url of the site to embedwidthnumberAn optional width of the modal in pixelsheightnumberAn optional height of the modal in pixelsfullScreenbooleanAn optional boolean, if true the modal will take up the whole screenhideBackdropbooleanAn optional boolean, if true the dark backdrop will be hiddenhidePaperbooleanAn optional boolean, if true the colored background will be removeddisablePointerEventsbooleanAn optional boolean, if true the modal will not react to mouse or touch events

---

# NOTIFICATION

# Notification

## `OBR.notification`[​](#obrnotification)

Show notifications in the Owlbear Rodeo interface.

# Reference

## Methods[​](#methods)

### `show`[​](#show)

```
async show(message, variant?)

```

Show a notification.

**Parameters**
NAMETYPEDESCRIPTIONmessagestringThe message to show in the notificationvariant"DEFAULT" | "ERROR" | "INFO" | "SUCCESS" | "WARNING"An optional style variant for the notification
Returns the notification ID as a string.

### `close`[​](#close)

```
async close(id)

```

Close a notification.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the notification to close

---

# PARTY

# Party

## `OBR.party`[​](#obrparty)

The party api gives you access to other players currently in the room.

# Reference

## Methods[​](#methods)

### `getPlayers`[​](#getplayers)

```
async getPlayers()

```

Get the other players currently in the room.

Returns an array of [Players](#player).

### `onChange`[​](#onchange)

```
onChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(players: [Player](/extensions/reference/player)[]) => voidA callback for when any connected player joins, leaves or changes
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onChange` event with a React `useEffect`.
 * `onChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.party.onChange((party) => {
      // React to party changes
    }),
  []
);

```

---

# PLAYER

# Player

## `OBR.player`[​](#obrplayer)

The player API gives you access to the current player using Owlbear Rodeo.

# Reference

**Properties**
NAMETYPEDESCRIPTIONidstringThe user ID for this player. This will be shared if the same player joins a room multiple times
## Methods[​](#methods)

### `getSelection`[​](#getselection)

```
async getSelection()

```

Get the current selection for this player.

Returns an array of [Item](/extensions/reference/items/item) IDs or undefined if the player has no current selection.

### `select`[​](#select)

```
async select(items, replace?)

```

Select items for the player.

**Parameters**
NAMETYPEDESCRIPTIONitemsstring[]An array of item IDs to selectreplacebooleanAn optional boolean, if true the users selection will be replaced, if false the selection will be combined with their current selection
### `deselect`[​](#deselect)

```
async deselect(items)

```

Deselect a set of items or all items.

**Parameters**
NAMETYPEDESCRIPTIONitemsstring[]An optional array if item IDs to deselect, if undefined all items will be deselected
### `getName`[​](#getname)

```
async getName()

```

Get the name for this player.

Returns a string.

### `setName`[​](#setname)

```
async setName(name)

```

**Parameters**
NAMETYPEDESCRIPTIONnamestringThe new name for this player
### `getColor`[​](#getcolor)

```
async getColor()

```

Get the color for this player.

Returns a string.

### `setColor`[​](#setcolor)

```
async setColor(color)

```

**Parameters**
NAMETYPEDESCRIPTIONcolorstringThe new color for this player
### `getSyncView`[​](#getsyncview)

```
async getSyncView()

```

Get whether this player currently has sync view enabled

Returns a boolean.

### `setSyncView`[​](#setsyncview)

```
async setSyncView(syncView)

```

**Parameters**
NAMETYPEDESCRIPTIONsyncViewbooleanThe new sync view state for this player
### `getId`[​](#getid)

```
async getId()

```

Get the user ID for this player. In most cases the `id` property should be used instead as it is synchronous.

This will be shared if the same player joins a room multiple times.

Returns a string.

### `getRole`[​](#getrole)

```
async getRole()

```

Get the current role for this player.

returns `"GM" | "PLAYER"`.

### `getMetadata`[​](#getmetadata)

```
async getMetadata()

```

Get the current metadata for this player.

returns a [Metadata](/extensions/reference/metadata) object.

### `setMetadata`[​](#setmetadata)

```
async setMetadata(update)

```

Update the metadata for this player.

See [Metadata](/extensions/reference/metadata) for best practices when updating metadata.

**Parameters**
NAMETYPEDESCRIPTIONupdatePartial<[Metadata](/extensions/reference/metadata)>A partial update to this players metadata. The included values will be spread among the current metadata to avoid overriding other values.
### `hasPermission`[​](#haspermission)

```
async hasPermission(permission)

```

Does this player have the given permission.

**Parameters**
NAMETYPEDESCRIPTIONpermission[Permission](/extensions/reference/permission)The permission to check
Returns a boolean.

### `getConnectionId`[​](#getconnectionid)

```
async getConnectionId()

```

Get the current connection ID for this player.

This will be unique if the same player joins the room multiple times.

Returns a string.

### `onChange`[​](#onchange)

```
onChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(player: [Player](/extensions/reference/player)) => voidA callback for when a value on the current player changes
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onChange` event with a React `useEffect`.
 * `onChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.player.onChange((player) => {
      // React to player changes
    }),
  []
);

```

---

# POPOVER

# Popover

## `OBR.popover`[​](#obrpopover)

The popover API allows you to display custom UI over the top of the Owlbear Rodeo interface.

# Reference

## Methods[​](#methods)

### `open`[​](#open)

```
async open(popover)

```

Open a new popover.

**Parameters**
NAMETYPEDESCRIPTIONpopover[Popover](#popover-1)The popover to open
**Example**

```
OBR.contextMenu.create({
  id: "rodeo.owlbear.example",
  icons: [
    {
      icon: "icon.svg",
      label: "Example",
    },
  ],
  onClick(_, elementId) {
    OBR.popover.open({
      id: "rodeo.owlbear.example/popover",
      url: "/popover",
      height: 80,
      width: 200,
      anchorElementId: elementId,
    });
  },
});

```

### `close`[​](#close)

```
async close(id)

```

Close an open popover.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the popover to close
### `getWidth`[​](#getwidth)

```
async getWidth(id)

```

Get the width of a popover.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the popover
### `getHeight`[​](#getheight)

```
async getHeight(id)

```

Get the height of a popover.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the popover
### `setWidth`[​](#setwidth)

```
async setWidth(id)

```

Set the width of a popover.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the popoverwidthnumberThe width of the popover
### `setHeight`[​](#setheight)

```
async setHeight(id)

```

Set the height of a popover.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the popoverheightnumberThe height of the popover
## Type Definitions[​](#type-definitions)

### Popover[​](#popover-1)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONidstringThe ID of this popoverurlstringThe url of the site to embedwidthnumberThe width of the popover in pixelsheightnumberThe height of the popover in pixelsanchorElementIdstringAn optional ID of the element to anchor the popover toanchorPosition{ left: number; top: number }An optional position to anchor the popover toanchorOrigin{ horizontal: "CENTER" | "LEFT" | "RIGHT"; vertical: "BOTTOM" | "CENTER" | "TOP" }An optional origin for the popover anchortransformOrigin{ horizontal: "CENTER" | "LEFT" | "RIGHT"; vertical: "BOTTOM" | "CENTER" | "TOP" }An optional origin for the popover transformanchorReference"ELEMENT" | "POSITION"Optionally use either the elementId as the anchor or the positionhidePaperbooleanAn optional boolean, if true the colored background will be removeddisableClickAwaybooleanAn optional boolean, if true the popover will remain open when the user clicks away from itmarginThresholdbooleanAn optional number, how close the popover is allowed to get to the document borders

---

# ROOM

# Room

## `OBR.room`[​](#obrroom)

The room API gives you access to the current room the extension is being used in.

# Reference

**Properties**
NAMETYPEDESCRIPTIONidstringA unique ID for the current room.
## Methods[​](#methods)

### `getPermissions`[​](#getpermissions)

```
async getPermissions()

```

Get the current permissions for players in this room.

Returns a [Permission](/extensions/reference/permission) array.

### `onPermissionsChange`[​](#onpermissionschange)

```
onPermissionsChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(permissions: [Permission](/extensions/reference/permission)[]) => voidA callback for when the permissions of the current room changes
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onPermissionsChange` event with a React `useEffect`.
 * `onPermissionsChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.room.onPermissionsChange((permissions) => {
      // React to rooms permissions change
    }),
  []
);

```

### `getMetadata`[​](#getmetadata)

```
async getMetadata()

```

Get the current metadata for this room.

returns a [Metadata](/extensions/reference/metadata) object.

### `setMetadata`[​](#setmetadata)

```
async setMetadata(update)

```

Update the metadata for this room.

See [Metadata](/extensions/reference/metadata) for best practices when updating metadata.

Room metadata is intended for small bits of stored data for an extension.

In total the room metadata must be under 16kB.

**Parameters**
NAMETYPEDESCRIPTIONupdatePartial<[Metadata](/extensions/reference/metadata)>A partial update to this rooms metadata. The included values will be spread among the current metadata to avoid overriding other values.
### `onMetadataChange`[​](#onmetadatachange)

```
onMetadataChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(metadata: [Metadata](/extensions/reference/metadata)) => voidA callback for when the metadata of the current room changes
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onMetadataChange` event with a React `useEffect`.
 * `onMetadataChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.room.onMetadataChange((metadata) => {
      // React to rooms metadata changes
    }),
  []
);

```

---

# SCENE

# Scene

## `OBR.scene`[​](#obrscene)

A scene is an infinite space for you to lay out images, drawings, fog and more.

# Reference

## Methods[​](#methods)

### `isReady`[​](#isready)

```
async isReady()

```

Returns true if there is a scene opened and it is ready to interact with.

### `onReadyChange`[​](#onreadychange)

```
onReadyChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(ready: boolean) => voidA callback for when the current scene changes its ready state
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onReadyChange` event with a React `useEffect`.
 * `onReadyChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.scene.onReadyChange((ready) => {
      if (ready) {
        // interact with the scene
      }
    }),
  []
);

```

### `getMetadata`[​](#getmetadata)

```
async getMetadata()

```

Get the current metadata for this scene.

returns a [Metadata](/extensions/reference/metadata) object.

### `setMetadata`[​](#setmetadata)

```
async setMetadata(update)

```

Update the metadata for this scene.

See [Metadata](/extensions/reference/metadata) for best practices when updating metadata.

**Parameters**
NAMETYPEDESCRIPTIONupdatePartial<[Metadata](/extensions/reference/metadata)>A partial update to this scenes metadata. The included values will be spread among the current metadata to avoid overriding other values.
### `onMetadataChange`[​](#onmetadatachange)

```
onMetadataChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(metadata: [Metadata](/extensions/reference/metadata)) => voidA callback for when the metadata changes
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onMetadataChange` event with a React `useEffect`.
 * `onMetadataChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.scene.onMetadataChange((metadata) => {
      // React to metadata changes
    }),
  []
);

```

## 📄️ Fog

OBR.scene.fog

## 📄️ Grid

OBR.scene.grid

## 📄️ History

OBR.scene.history

## 📄️ Items

OBR.scene.items

## 📄️ Local

OBR.scene.local

---

# THEME

# Theme

## `OBR.theme`[​](#obrtheme)

The theme API gives you access to the current theme used by Owlbear Rodeo.

# Reference

## Methods[​](#methods)

### `getTheme`[​](#gettheme)

```
async getTheme()

```

Get the current Owlbear Rodeo theme.

Returns a [Theme](#theme-1) object.

### `onChange`[​](#onchange)

```
onChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(theme: [Theme](#theme-1)) => voidA callback for when the current theme changes
Returns a function that when called will unsubscribe from change events.

**Example**

```
/**
 * Use an `onChange` event with a React `useEffect`.
 * `onChange` returns an unsubscribe event to make this easy.
 */
useEffect(
  () =>
    OBR.theme.onChange((theme) => {
      // React to theme changes
    }),
  []
);

```

## Type Definitions[​](#type-definitions)

### Theme[​](#theme-1)

The palette of a theme
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONmode"DARK" | "LIGHT"The color mode of the themeprimary[ThemeColor](#themecolor)The primary color of the themesecondary[ThemeColor](#themecolor)The secondary color of the themebackground[ThemeBackground](#themebackground)The background color of the themetext[ThemeText](#themetext)The text color of the theme
### ThemeColor[​](#themecolor)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONmainstringThe main colorlightstringA lightened version of the main colordarkstringA darkened version of the main colorcontrastTextstringA text color that contrasts with the main color
### ThemeBackground[​](#themebackground)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONdefaultstringThe base background colorpaperstringA highlight background color used for raised background elements
### ThemeText[​](#themetext)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONprimarystringThe primary text colorsecondarystringA secondary text color that recedes compared to the primary textdisabledstringA disabled text color used for disabled elements

---

# TOOL

# Tool

## `OBR.tool`[​](#obrtool)

Manage custom tools, tool modes and tool actions.

# Reference

## Methods[​](#methods)

### `create`[​](#create)

```
async create(tool)

```

Create a new tool.

**Parameters**
NAMETYPEDESCRIPTIONtool[Tool](#tool-1)The new tool to create
### `remove`[​](#remove)

```
async remove(id)

```

Remove an existing tool.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the tool to remove
### `getActiveTool`[​](#getactivetool)

```
async getActiveTool()

```

Returns a string of the current active tool ID.

### `onToolChange`[​](#ontoolchange)

```
onToolChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(id: string) => voidA callback for when the current tool changes
Returns a function that when called will unsubscribe from change events.

### `createAction`[​](#createaction)

```
async createAction(action)

```

Create a new tool action.

**Parameters**
NAMETYPEDESCRIPTIONaction[ToolAction](#toolaction)The new tool action to create
### `removeAction`[​](#removeaction)

```
async removeAction(id)

```

Remove an existing tool action.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the tool action to remove
### `createMode`[​](#createmode)

```
async createMode(mode)

```

Create a new tool mode.

**Parameters**
NAMETYPEDESCRIPTIONmode[ToolMode](#toolmode)The new tool mode to create
### `removeMode`[​](#removemode)

```
async removeMode(id)

```

Remove an existing tool mode.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the tool mode to remove
### `activateMode`[​](#activatemode)

```
async activateMode(toolId, modeId)

```

Activate a specific mode for a given tool.

**Parameters**
NAMETYPEDESCRIPTIONtoolIdstringThe ID of the toolmodeIdstringThe ID of the tool mode to activate
### `getActiveToolMode`[​](#getactivetoolmode)

```
async getActiveToolMode()

```

Returns a string of the current active tool mode ID.

### `onToolModeChange`[​](#ontoolmodechange)

```
onToolModeChange(callback);

```

**Parameters**
NAMETYPEDESCRIPTIONcallback(id: string) => voidA callback for when the current tool mode changes
Returns a function that when called will unsubscribe from change events.

### `getMetadata`[​](#getmetadata)

```
async getMetadata(id)

```

Get the metadata for the given tool.

**Parameters**
NAMETYPEDESCRIPTIONidstringThe ID of the tool
Returns a [Metadata](/extensions/reference/metadata) object.

### `setMetadata`[​](#setmetadata)

```
async setMetadata(toolId, update)

```

Update the metadata for a given tool.

**Example**

Update the stroke color of a custom drawing tool

```
async function handleChange(value: string) {
  await OBR.tool.setMetadata("com.example.drawing", {
    strokeColor: value,
  });
}

```
This does not override any metadata properties that already exist.
For example if the metadata looks like this:
```
{
  strokeWidth: 1,
  strokeColor: "red"
}

```

And `handleChange("blue")` is called in the example above then the resulting metadata will look like this:

```
{
  strokeWidth: 1,
  strokeColor: "blue"
}

```

**Parameters**
NAMETYPEDESCRIPTIONtoolIdstringThe ID of the toolupdatePartial<[Metadata](/extensions/reference/metadata)>The metadata data update to use. The metadata is spread into the existing metadata.
## Type Definitions[​](#type-definitions)

### Tool[​](#tool-1)

A tool in the toolbar.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONidstringThe ID of this toolicons[ToolIcon](#toolicon)[]The icons for this tooldisabled[ToolFilter](#toolfilter)An optional filter for checking if the tool should be disabledonClick(context: [ToolContext](#toolcontext), elementId: string) => void | undefined | booleanAn optional callback for when the tool icon is clicked. By default the clicked tool will be activated. If defined return true to perform the default click action.shortcutstringAn optional key shortcut for this tooldefaultModestringAn optional ID of the mode to be activated by defaultdefaultMetadata[Metadata](/extensions/reference/metadata)An optional Metadata object to use as default
### ToolAction[​](#toolaction)

A tool action defines an item in the tool menu bar.

Unlike a tool mode an action is a clickable item but won&#x27;t be activated when clicked.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONidstringThe ID of this actionicons[ToolIcon](#toolicon)[]The icons for this actiondisabled[ToolFilter](#toolfilter)An optional filter for checking if the action should be disabledonClick(context: [ToolContext](#toolcontext), elementId: string) => voidAn optional callback for when the action icon is clickedshortcutstringAn optional key shortcut for this action
### ToolMode[​](#toolmode)

A tool mode will be activated when clicked.

Once a mode is active it will receive pointer events such as `onToolMove` and `onToolDragMove`.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONidstringThe ID of this modeicons[ToolIcon](#toolicon)[]The icons for this modedisabled[ToolFilter](#toolfilter)An optional filter for checking if the mode should be disabledonClick(context: [ToolContext](#toolcontext), elementId: string) => void | undefined | booleanAn optional callback for when the mode icon is clicked. By default the clicked mode will be activated. If defined return true to perform the default click action.shortcutstringAn optional key shortcut for this modecursors[ToolCursor](#toolcursor)[]An optional array of cursorsonToolClick(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => void | undefined | booleanAn optional callback for when a single click is made by the tool. By default the clicked item will be selected if it is unlocked. If defined return true to perform the default click action.onToolDoubleClick(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => void | undefined | booleanAn optional callback for when a double click is made by the tool. By default the clicked item will be selected event if it is locked. If defined return true to perform the default double click action.onToolDown(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when the pointer enters the down stateonToolMove(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when the pointer movesonToolUp(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when the pointer enters the up stateonToolDragStart(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when a drag starts on the viewportonToolDragMove(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when dragging on the viewportonToolDragEnd(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when a drag ends on the viewportonToolDragCancel(context: [ToolContext](#toolcontext), event: [ToolEvent](#toolevent)) => voidAn optional callback for when a drag event is canceled by either switching modes or pressing the Escape keyonActivate(context: [ToolContext](#toolcontext))An optional callback for when the tool mode is activatedonDeactivate(context: [ToolContext](#toolcontext) )An optional callback for when the tool mode is deactivatedonKeyDown(context: [ToolContext](#toolcontext), event: [KeyEvent](#keyevent)) => voidAn optional callback for when a key is pressedonKeyUp(context: [ToolContext](#toolcontext), event: [KeyEvent](#keyevent)) => voidAn optional callback for when a key is releasedpreventDrag[ToolModeFilter](#toolmodefilter)An optional filter for checking if the drag event should be prevented. If the filter returns true the default drag operation will be used which mimics the Move tool.
### ToolContext[​](#toolcontext)

Holds the state of the tool.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONactiveToolstringThe ID of the current active toolactiveModestringAn optional ID of the current active tool modemetadata[Metadata](/extensions/reference/metadata)The metadata of the current active tool
### ToolEvent[​](#toolevent)

A pointer event for a tool mode.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONpointerPosition[Vector2](/extensions/reference/vector2)The pointer position relative to the viewporttarget[Item](/extensions/reference/items/item)An optional target for the pointer eventtransformerbooleanIf we have a target are we selecting a transformer control pointaltKeybooleanIs the Alt key pressed downshiftKeybooleanIs the Shift key pressed downctrlKeybooleanIs the Ctrl key pressed downmetaKeybooleanIs the Meta key pressed down
### KeyEvent[​](#keyevent)

A key event for a tool mode.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONcodestringA string representation of the physical key pressedkeystringA string representation of the keyaltKeybooleanIs the Alt key pressed downshiftKeybooleanIs the Shift key pressed downctrlKeybooleanIs the Ctrl key pressed downmetaKeybooleanIs the Meta key pressed downrepeatbooleanIs the key being held down such that it is automatically repeating
### ToolIcon[​](#toolicon)

An icon for a tool.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONiconstringThe url of the icon as either a relative or absolute pathlabelstringThe label to use for the tooltip of the iconfilter[ToolFilter](#toolfilter)An optional filter to control when this icon will be shown
### ToolFilter[​](#toolfilter)

A filter to control if various tools, actions or modes will be shown.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONactiveToolsstring[]An optional array of tool IDs that can be activeactiveModesstring[]An optional array of tool mode IDs that can be activepermissions[Permission](/extensions/reference/permission)[]An optional permissions filterroles("GM" | "PLAYER")[]An optional array of roles needed for the player, defaults to no role neededmetadata[KeyFilter](/extensions/reference/filters#keyfilter)[]An optional array of filters to run on the current tool metadata
### ToolModeFilter[​](#toolmodefilter)

A filter to use for a tool mode.

Extends [ToolFilter](#toolfilter).
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONtarget[KeyFilter](/extensions/reference/filters#keyfilter)[]An optional array of filters to run on the current target of a tool modedraggingbooleanAn optional boolean to check the dragging state of the current tool mode
### ToolCursor[​](#toolcursor)

A cursor to use for a tool mode.
TYPEobject
**Properties**
NAMETYPEDESCRIPTIONcursorstringA css cursor string e.g. "pointer"filter[ToolModeFilter](#toolmodefilter)An optional filter to run on the current tool mode

---

# VIEWPORT

# Viewport

## `OBR.viewport`[​](#obrviewport)

Control the viewport of the current scene.

The viewport represents this players view of the current scene.

# Reference

## Methods[​](#methods)

### `reset`[​](#reset)

```
async reset()

```

Reset the viewport to the initial view.
If no map exists in the scene this will be the origin.
If a map exists the viewport will fit to this map.
Returns a [ViewportTransform](#viewporttransform) with the transform it was reset to.

### `animateTo`[​](#animateto)

```
async animateTo(transform)

```

Animate the viewport to the given transform.

**Parameters**
NAMETYPEDESCRIPTIONtransform[ViewportTransform](#viewporttransform)The new transform to animate to
### `animateToBounds`[​](#animatetobounds)

```
async animateTo(bounds)

```

Animate the viewport to the given bounding box.

**Parameters**
NAMETYPEDESCRIPTIONbounds[BoundingBox](/extensions/reference/bounding-box)The bounding box to animate to
**Example**

Zoom on to the selected items when clicking a context menu item

```
OBR.contextMenu.create({
  id: "rodeo.owlbear.example",
  icons: [
    {
      icon: "icon.svg",
      label: "Example",
    },
  ],
  async onClick(context) {
    OBR.viewport.animateToBounds(context.selectionBounds);
  },
});

```

### `getPosition`[​](#getposition)

```
async getPosition()

```

Get the current position of the viewport.

Returns a [Vector2](/extensions/reference/vector2).

### `setPosition`[​](#setposition)

```
async setPosition(position)

```

Set the position of the viewport.

**Parameters**
NAMETYPEDESCRIPTIONposition[Vector2](/extensions/reference/vector2)The new position of the viewport
### `getScale`[​](#getscale)

```
async getScale()

```

Get the current scale of the viewport.

A scale of 1 represents a 1:1 scale.

Returns a number.

### `setScale`[​](#setscale)

```
async setScale(scale)

```

Set the scale of the viewport.

**Parameters**
NAMETYPEDESCRIPTIONscalenumberThe new scale of the viewport
### `getWidth`[​](#getwidth)

```
async getWidth()

```

Get the width of the viewport.

Returns a number.

### `getHeight`[​](#getheight)

```
async getHeight()

```

Get the height of the viewport.

Returns a number.

### `transformPoint`[​](#transformpoint)

```
async transformPoint(point)

```

Transform a point from the viewport coordinate space into the screens coordinate space.

**Parameters**
NAMETYPEDESCRIPTIONpoint[Vector2](/extensions/reference/vector2)The point to transform
Returns a [Vector2](/extensions/reference/vector2).

### `inverseTransformPoint`[​](#inversetransformpoint)

```
async inverseTransformPoint(point)

```

Transform a point from the screens coordinate space into the viewport coordinate space.

**Parameters**
NAMETYPEDESCRIPTIONpoint[Vector2](/extensions/reference/vector2)The point to transform
Returns a [Vector2](/extensions/reference/vector2).

## Type Definitions[​](#type-definitions)

### ViewportTransform[​](#viewporttransform)

TYPEobject
**Properties**
NAMETYPEDESCRIPTIONposition[Vector2](/extensions/reference/vector2)The position of the viewportscalenumberThe scale of the viewport

---

