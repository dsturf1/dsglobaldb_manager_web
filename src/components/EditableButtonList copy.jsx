import React, { useState } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const EditableButtonList = ({ title, items, onItemsChange }) => {
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const newItems = Array.from(items);
    const [removed] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, removed);
    onItemsChange(newItems);
  };

  const handleDelete = (index) => {
    const newItems = items.filter((_, i) => i !== index);
    onItemsChange(newItems);
  };

  const handleAdd = () => {
    const newItems = [...items, ''];
    onItemsChange(newItems);
    setEditingIndex(newItems.length - 1);
    setEditValue('');
  };

  const handleDoubleClick = (index) => {
    setEditingIndex(index);
    setEditValue(items[index]);
  };

  const handleEditChange = (e) => {
    setEditValue(e.target.value);
  };

  const handleEditSubmit = (e) => {
    if (e.key === 'Enter') {
      const newItems = [...items];
      newItems[editingIndex] = editValue;
      onItemsChange(newItems);
      setEditingIndex(null);
    }
  };

  const handleBlur = () => {
    if (editValue.trim() !== '') {
      const newItems = [...items];
      newItems[editingIndex] = editValue;
      onItemsChange(newItems);
    }
    setEditingIndex(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={handleAdd}
          className="px-2 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
        >
          추가
        </button>
      </div>
      
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="button-list">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="flex flex-wrap gap-2 min-h-[50px]"
            >
              {items.map((item, index) => (
                <Draggable key={`${item}-${index}`} draggableId={`${item}-${index}`} index={index}>

                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                      className={`relative ${snapshot.isDragging ? 'opacity-50' : ''}`}
                    >
                        <button
                          onDoubleClick={() => handleDoubleClick(index)}
                          className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 relative group w-[120px]"
                        >
                          {item}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(index);
                            }}
                            className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </button>

                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

export default EditableButtonList; 